// strategies
load_code("character_utils");
load_code("tasks")

var Strategies = {};

Strategies.BaseStrategy = class BaseStrategy {
	child_strategies = {
		"idle": Strategies.IdleStrategy,
	};
	tasks = [
		this.task({action: () => this.child_strategy("idle")})
	];

	on_start(){
		game_log(this.constructor.name + " started!");
		set_message(this.constructor.name);
	};

	constructor(character, parent, manager, options = {}) {
		this.character = character;
		this.current_target = null;
		this.parent = parent;
		this.manager = manager;
		this.options = options;
	}

	execute() {
		let task_results = this.run_tasks();
		if (task_results) return task_results;

		return this.done();
	};

	running() { 
		return {status: "ok"};
	};

	fail() {
		return {status: "fail", next_strategy: this.parent};
	};

	done() {
		return {status: "done", next_strategy: this.parent};
	};

	task(opts = {}) {
		if (opts.type) {
			return new Tasks[opts.type]({context: this});
		} else {
			return new Task(opts)
		}
	}

	run_tasks() {
		for (let task of this.tasks) {
			let condition_result = task.unconditional() || task.condition();
			if (condition_result) {
				task.do_log();
				let action_result = task.action(condition_result);
				if (action_result) return action_result;
			}
		}
	}

	child_strategy(reason, options) {
		let next_strategy = new this.child_strategies[reason](this.character, this, this.manager, options);
		return {status: "done", next_strategy: next_strategy};
	}

	supplies_needed() {
		let supplies_needed = [];
		for (let p_type of this.manager.options.potions_to_restock) {
			let need_more = this.character.item_count(p_type) < this.manager.options.potion_restock_threshold;
			if (need_more) {
				supplies_needed.push(p_type);
			}
		}
		
		if (supplies_needed.length > 0) {
			return supplies_needed;
		} else {
			return null;
		}
	}

	heal_if_needed() {
		if (this.character.low_health() || this.character.low_mp()) {
			use_hp_or_mp();	
		} else if (!is_on_cooldown("regen_hp") && this.character.hp < this.character.max_hp) {
			use_skill("regen_hp");
		} else if (!is_on_cooldown("regen_mp") && this.character.mp < this.character.max_mp) {
			use_skill("regen_mp");
		}
	};
	
	grindable_monster(entity) {
		return 	(entity.type == "monster")
			&& 	(!entity.dead)
			&& 	(this.manager.options.whitelisted_spawns.includes(entity.mtype))
			&& 	(entity.xp >= this.manager.options.monster_min_xp)
			&& 	(entity.attack < this.manager.options.monster_max_attack)
	}
	
	get_closest_entity(condition) {
		let closest_distance = 999999;
		
		let closest_monster = null;
		for (key in parent.entities) {
			let entity = parent.entities[key];

			if (!condition.call(this, entity)) {
				continue;
			}

			let d = distance(this.character, entity);
			if (d < closest_distance) {
				closest_distance = d;
				closest_monster = entity;
			}
		}
		return closest_monster;
	}
}

Strategies.Respawn = class Respawn extends Strategies.BaseStrategy {
	tasks = [
		this.task({
			condition: () => this.character.rip,
			action: () => {
				respawn();
				return this.running();
			},
			log: "Respawning...",
		})
	]
}

Strategies.IdleStrategy = class IdleStrategy extends Strategies.BaseStrategy {
	tasks = [
		this.task({type: "DoNothing"})
	]
}

Strategies.SmartMove = class SmartMove extends Strategies.BaseStrategy {
	tasks = [
		this.task({
			condition: () => this.moving,
			action: () => this.running()
		})
	]

	on_start() {
		super.on_start();
		this.moving = true;
		smart_move(this.options.x, this.options.y)
			.then(() => this.moving = false)
	}
}

Strategies.GoToMonstersToGrind = class GoToMonstersToGrind extends Strategies.BaseStrategy {
	next_spawn_i = 0;
	child_strategies = {
		"dead": Strategies.Respawn,
		"monsters_found": Strategies.GrindNearbyMonsters,
		"move": Strategies.SmartMove,
	}
	tasks = [
		this.task({
			condition: () => this.character.rip,
			action: () => this.child_strategy("dead")
		}),
		this.task({
			condition: () => this.get_closest_entity(this.grindable_monster),
			action: (m) => this.child_strategy("monsters_found"),
			log: "Monsters found!",
		}),
		this.task({
			condition: () => this.tried_all_spawns(),
			action: () => {	
				this.next_spawn_i = 0
				return this.running();
			},
			log: "Tried all spawns! Restarting from first spawn...",
		}),
		this.task({
			action: () => this.child_strategy_move_to_next_spawn(),
			log: "No Monsters Nearby, trying next spawn."
		})
	]

	child_strategy_move_to_next_spawn() {
		var current_spawn = this.valid_spawns()[this.next_spawn_i];
		this.next_spawn_i = this.next_spawn_i + 1;
		
		return this.child_strategy("move", {x: current_spawn.boundary[0], y: current_spawn.boundary[1]})
	}

	tried_all_spawns() {
		return this.next_spawn_i >= this.valid_spawns().length;
	}

	valid_spawns() {
		if (this._valid_spawns) return this._valid_spawns;
		var spawns = get_map().monsters.filter(
			monster => this.manager.options.whitelisted_spawns.includes(monster.type)
		);
		return this._valid_spawns = spawns
	}
}

Strategies.GrindNearbyMonsters = class GrindNearbyMonsters extends Strategies.BaseStrategy {
	child_strategies = {
		"supplies_needed": Strategies.Resupply,
		"have_target": Strategies.FightMonster,
	}
	tasks = [
		this.task({type: "FailIfDead"}),
		this.task({
			action: () => this.heal_if_needed()
		}),
		this.task({
			action: loot
		}),
		this.task({
			condition: () => this.monster_targeting_me(),
			action: (m) => this.child_strategy("have_target", {monster: m}),
			log: "Monster targeting me, retaliating!"
		}),
		this.task({
			condition: () => this.supplies_needed(),
			action: () => this.child_strategy("supplies_needed"),
			log: "Low supplies!"
		}),
		this.task({
			condition: () => this.get_closest_entity(this.grindable_monster),
			action: (m) => this.child_strategy("have_target", {monster: m})
		})
	]

	monster_targeting_me() {
		return get_nearest_monster({
			target: this.character
		});
	};
}

Strategies.FightMonster = class FightMonster extends Strategies.BaseStrategy {
	tasks = [
		this.task({type: "FailIfDead"}),
		this.task({
			action: () => this.heal_if_needed()
		}),
		this.task({
			condition: () => is_moving(this.character),
			action: () => this.running()
		}),
		this.task({
			condition: () => get_targeted_monster(),
			action: (m) => {
				this.move_to_and_attack_target(m);
				return this.running();
			}
		})
	]

	on_start() {
		super.on_start();
		game_log("Fighting '" + this.options.monster.name + "'");
		change_target(this.options.monster);
	}

	move_to_and_attack_target(target) {
		if(!is_in_range(target)) {
			this.move_to_target(target);
		} else if(can_attack(target)) {
			attack(target);
		}
	};
	
	move_to_target(target) {
		let too_far = distance(this.character, target) > 200;
		if (too_far) {
			smart_move(
				this.character.x+(target.x-this.character.x), 
				this.character.y+(target.y-this.character.y)
			);
		} else {
			move(
				this.character.x+(target.x-this.character.x)/2, 
				this.character.y+(target.y-this.character.y)/2
			);
		}
	};
}

Strategies.Resupply = class Resupply extends Strategies.BaseStrategy {
	moving_state = "";
	tasks = [
		this.task({
			condition: () => this.moving_state == "moving",
			action: () => this.running()
		}),
		this.task({
			condition: () => this.supplies_needed(),
			action: (supplies_needed) => {
				// Assumes any supplies are potions - should extend to other types if needed
				this.move_to_potion_vendor_and_buy_potions(supplies_needed[0], this.manager.options.potion_restock_quantity)
				return this.running();
			}
		})
	]

	move_to_potion_vendor_and_buy_potions(potion_type, quantity) {
		var pot_npc_coords = find_npc("fancypots");
		if (pot_npc_coords) {
			let too_far = distance(this.character, pot_npc_coords) > 100;
			if (!too_far) {
				buy(potion_type, quantity);
			} else {
				game_log("Moving to Potion NPC");
				this.moving_state = "moving";
				smart_move(pot_npc_coords)
					.then(
						() => this.moving_success(), 
						() => this.moving_fail());
			}
		} else {
			game_log("Pot NPC Not Found");
		}
	}

	moving_success() {
		this.moving_state = "";
	}

	moving_fail() {
		this.moving_success();
	}
}
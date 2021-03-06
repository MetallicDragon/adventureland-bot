import * as char_utils from "./character_utils.js";
import * as map_utils from "./map_utils.js";
import * as Tasks from "./tasks.js";

export class BaseStrategy {
	child_strategies = {
		"idle": IdleStrategy,
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
		return {status: "running", next_strategy: this};
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
			return new Tasks.BaseTask(opts)
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
		return {status: "child_strategy", next_strategy: next_strategy};
	}

	supplies_needed() {
		let supplies_needed = [];
		for (let p_type of this.manager.options.potions_to_restock) {
			let need_more = char_utils.item_count(this.character, p_type) < this.manager.options.potion_restock_threshold;
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
		if (char_utils.low_health(this.character) || char_utils.low_mp(this.character)) {
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

export class Respawn extends BaseStrategy {
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

export class IdleStrategy extends BaseStrategy {
	tasks = [
		this.task({type: "DoNothing"})
	]
}

export class SmartMove extends BaseStrategy {
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

export class GoToMonstersToGrind extends BaseStrategy {
	next_spawn_i = 0;
	child_strategies = {
		"dead": Respawn,
		"monsters_found": GrindNearbyMonsters,
		"move": SmartMove,
		"inventory_almost_full": ManageInventory,
		"change_map": MoveToAndGoThroughDoor
	}
	tasks = [
		this.task({
			condition: () => char_utils.free_inventory_spaces(this.character) < 4,
			action: () => this.child_strategy("inventory_almost_full"),
			log: "Inventory almost full, going to bank."
		}),
		this.task({
			condition: () => this.character.rip,
			action: () => this.child_strategy("dead")
		}),
		this.task({
			condition: () => this.character.map != "main",
			action: () => {
				let door = map_utils.door_from_name(get_map(), "main");
				return this.child_strategy("change_map", {door: door});
			}
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

export class GrindNearbyMonsters extends BaseStrategy {
	child_strategies = {
		"supplies_needed": Resupply,
		"have_target": FightMonster,
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

export class FightMonster extends BaseStrategy {
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

export class Resupply extends BaseStrategy {
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

export class ManageInventory extends BaseStrategy {
	child_strategies = {
		"not_in_bank": MoveToAndGoThroughDoor,
	}
	tasks = [
		this.task({
			condition: () => this.character.map == "main",
			action: () => this.go_to_bank()
		}),
		this.task({
			action: () => this.deposit_everything_except_potions()
		})
	]

	go_to_bank() {
		let door = map_utils.door_from_name(get_map(), "bank");
		return this.child_strategy("not_in_bank", {door: door});
	}

	deposit_everything_except_potions() {
		let potions = ["hpot0", "mpot0", "hpot1", "mpot1", "hpotx", "mpotx"]
		let item_slots_to_deposit = [];
		for (i in this.character.items) {
			let item = this.character.items[i]
			let should_deposit_item = item && !potions.includes(item.name);
			if (should_deposit_item) {
				item_slots_to_deposit.push(i);
			}
		}
		for (let i_slot of item_slots_to_deposit) {
			bank_store(i_slot);
		}
	}
}

export class MoveToAndGoThroughDoor extends BaseStrategy {
	child_strategies = {
		"move": SmartMove,
	}
	went_through_door = false;
	tasks = [
		this.task({
			condition: () => is_transporting(this.character),
			action: () => this.running()
		}),
		this.task({
			condition: () => this.went_through_door,
			action: () => this.done()
		}),
		this.task({
			condition: () => !this.near_door(),
			action: () => this.go_to_door(),
		}),
		this.task({
			action: () => this.go_through_door()
		})
	]

	go_to_door() {
		return this.child_strategy("move", {x: this.options.door.x, y: this.options.door.y});
	}

	go_through_door() {
		this.went_through_door = true;
		transport(this.options.door.name, this.options.door.transport_id);
		return this.running();
	}

	near_door() {
		return distance(this.character, this.options.door) <= 100;
	}
}

// strategy_manager
import * as Strategies from "./strategies.js";

export default class StrategyManager {
	default_options = {
		monster_min_xp: 999999999,
		monster_max_attack: 120,
		initial_strategy: Strategies.GoToMonstersToGrind,
		whitelisted_spawns: [
			"bee",
			"croc",
			"goo",
			"armadillo",
			"snake",
		],
		potions_to_restock: ["hpot0", "mpot0"],
		potion_restock_threshold: 100,
		potion_restock_quantity: 400,
	}

	constructor(character, options) {
		this.character = character;
		this.options = {
			...this.default_options,
			...options
		}


		this.current_strategy = this.initial_strategy();
		this.current_strategy.on_start();
	}

	execute() {
		try {
			var last_result = this.current_strategy.execute();

			if (last_result.status == "fail" || last_result.status == "done") {
				this.current_strategy = last_result.next_strategy;
				if (!this.current_strategy) {
					game_log("Root Strategy has failed! Defaulting to IdleStrategy");
					this.current_strategy = this.fallback_strategy();
				}
				this.current_strategy.on_start();
				this.execute();
			}
		} catch (e) {
			game_log("Caught error while executing strategy!");
			show_json(e.stack);
			this.current_strategy = this.fallback_strategy();
			this.current_strategy.on_start();
			throw e;
		}
	};

	initial_strategy() {
		return new this.options.initial_strategy(this.character, null, this);
	};

	fallback_strategy() {
		return new Strategies.IdleStrategy(this.character, null, this)
	}
}
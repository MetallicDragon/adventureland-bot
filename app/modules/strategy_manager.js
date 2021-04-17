// strategy_manager
import * as Strategies from "./strategies.js";

export default class StrategyManager {
	default_options = {
		monster_min_xp: 999999999,
		monster_max_attack: 120,
		initial_strategy: "GoToMonstersToGrind",
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
		try {
			this.current_strategy.on_start();
		} catch (e) {
			this.handle_error(e);
		}
	}

	execute() {
		try {
			this._execute_until_strategy_running(0);
		} catch (e) {
			this.handle_error(e)
		}
	};

	_execute_until_strategy_running(depth) {
		if (depth > 20) {
			throw new Error("StrategyManager recursive execution limit exceeded (loop in strategy logic?)");
		}

		var last_result = this.current_strategy.execute();
		this.current_strategy = last_result.next_strategy;
		if (!this.current_strategy) {
			game_log("Root Strategy has failed! Defaulting to IdleStrategy");
			this.current_strategy = this.fallback_strategy();
		}

		if (last_result.status != "running") {
			this.current_strategy.on_start();
			//this._execute_until_strategy_running(depth + 1);
		}
	}

	handle_error(e) {
		game_log("Caught error while executing strategy!");
		show_json(e.stack);
		this.current_strategy = this.fallback_strategy();
		this.current_strategy.on_start();
		throw e;
	}

	initial_strategy() {
		return new Strategies[this.options.initial_strategy](this.character, null, this);
	};

	fallback_strategy() {
		return new Strategies.IdleStrategy(this.character, null, this)
	}
}
export class BaseTask {
	constructor(opts = {}) {
		this.action = opts.action;
		this.condition = opts.condition;
		this.context = opts.context;
		this.log = opts.log
	}

	unconditional() {
		return !this.condition
	}

	do_log() {
		if (typeof(this.log) == "string") {
			game_log(this.log)
		} else if (typeof(this.log) == "function") {
			game_log(this.log());
		}
	}
}

export class FailIfDead extends BaseTask {
	condition = function() { return this.character.rip }.bind(this.context)
	action = function() {
		game_log("Died!");
		return this.fail();
	}.bind(this.context);
}

export class DoNothing extends BaseTask {
	action = function() { return this.running() }.bind(this.context);
}

export class Fail extends BaseTask {
	action = function() { return this.fail()}.bind(this.context);
}

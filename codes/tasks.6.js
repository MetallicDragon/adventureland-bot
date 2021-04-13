// tasks
var Tasks = {};

class Task {
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

Tasks.FailIfDead = class FailIfDead extends Task {
	condition = () => this.context.character.rip
	action = () => {
		game_log("Died!");
		return this.context.fail();
	}
}

Tasks.DoNothing = class DoNothing extends Task {
	action = () => this.context.running();
}

Tasks.Fail = class Fail extends Task {
	action = () => this.context.fail();
}

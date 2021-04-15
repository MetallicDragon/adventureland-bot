# adventureland-bot
A bot for the bot-based MMO Adventure Land
# Sample Use

```js
import StrategyManager from "./modules/strategy_manager.js"

let strategy_manager = new StrategyManager(character, {
	monster_min_xp: 900,
	//initial_strategy: Strategies.BaseStrategy,
	whitelisted_spawns: ["snake"],
});

change_target(null);

setInterval(function(){
	strategy_manager.execute();
},1000/4);
```

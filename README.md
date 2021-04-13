# adventureland-bot
A bot for the bot-based MMO Adventure Land
# Sample Use

```js
load_code("strategy_manager");

strategy_manager = new StrategyManager(character, {
	monster_min_xp: 400,
	whitelisted_spawns: ["goo"],
});

change_target(null);

setInterval(function(){
	strategy_manager.execute();
},1000/4);
```

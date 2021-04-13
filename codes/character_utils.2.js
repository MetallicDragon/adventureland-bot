// character_utils
character.hp_percent = function() { return this.hp / this.max_hp };
character.mp_percent = function() { return this.mp / this.max_mp };
character.low_health = function() { return this.hp_percent() < 0.5 };
character.low_mp = function() { return this.mp_percent() < 0.5 };

character.item_count = function(item_name) {
    for (item of this.items) {
        if (item != null && item.name == item_name) {
            return item.q;
        }
    };
    return 0;
}

function low_health(entity) {
	return entity.hp < entity.max_hp * 0.5;
}
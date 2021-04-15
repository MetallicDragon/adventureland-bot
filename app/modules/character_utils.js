// character_utils
export function hp_percent(c){ return c.hp / c.max_hp };
export function mp_percent(c){ return c.mp / c.max_mp };
export function low_health(c){ return c.hp_percent() < 0.5 };
export function low_mp(c){ return c.mp_percent() < 0.5 };

export function item_count(c, item_name) {
    for (item of c.items) {
        if (item != null && item.name == item_name) {
            return item.q;
        }
    };
    return 0;
}
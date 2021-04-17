// character_utils
export function hp_percent(c){ return c.hp / c.max_hp };
export function mp_percent(c){ return c.mp / c.max_mp };
export function low_health(c){ return hp_percent(c) < 0.5 };
export function low_mp(c){ return mp_percent(c) < 0.5 };

export function item_count(c, item_name) {
    for (let item of c.items) {
        if (item != null && item.name == item_name) {
            return item.q;
        }
    };
    return 0;
}

export function free_inventory_spaces(c) {
    let count = 0;
    for (let item of c.items) {
        if (!item) count++;
    }
    return count
}
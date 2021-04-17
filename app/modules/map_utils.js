export function door_from_name(map, door_name) {
    for (let d of map.doors) {
        let d_name = d[4];
        if (d_name == door_name) {
            return {
                x: d[0],
                y: d[1],
                name: d[4],
                transport_id: d[5],
            }
        }
    }
    throw new Error("Could not find door '" + door_name + "' on map " + map.name + "!");
}
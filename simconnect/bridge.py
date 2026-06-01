import time
import json
import sys
import threading

from SimConnect import SimConnect, AircraftRequests


sm = None
aq = None


def normalize(value):
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="ignore").replace("\x00", "").strip()
    return value


def send(data):
    print(json.dumps(data), flush=True)


def read_var(name):
    global aq

    try:
        request = aq.find(name)
        return normalize(request.value)
    except Exception:
        return None


def write_var(name, value):
    global aq

    # IMPORTANTE:
    # aq.set precisa vir primeiro.
    # request.value pode alterar só o cache local e não aplicar no MSFS.
    try:
        aq.set(name, value)
        return {
            "ok": True,
            "method": "aq.set",
            "name": name,
            "value": value,
        }
    except Exception as e1:
        try:
            request = aq.find(name)
            request.value = value
            return {
                "ok": True,
                "method": "request.value",
                "name": name,
                "value": value,
            }
        except Exception as e2:
            return {
                "ok": False,
                "name": name,
                "value": value,
                "error_1": str(e1),
                "error_2": str(e2),
            }


def lbs_to_gallons(lbs):
    return float(lbs) / 6.0


def apply_fuel(total_fuel_lbs):
    total_gal = lbs_to_gallons(total_fuel_lbs)

    capacity_gal = read_var("FUEL_TOTAL_CAPACITY")
    capacity_gal = float(capacity_gal or 0)

    fuel_percent = 0
    if capacity_gal > 0:
        fuel_percent = min(100, max(0, (total_gal / capacity_gal) * 100))

    left_gal = total_gal / 2
    right_gal = total_gal / 2

    results = []

    # 1) Aplica percentual total primeiro
    results.append(write_var("FUEL_TOTAL_QUANTITY_PERCENT", fuel_percent))
    time.sleep(0.5)

    # 2) Aplica galões diretamente nos tanques principais
    results.append(write_var("FUEL_TANK_LEFT_MAIN_QUANTITY", left_gal))
    results.append(write_var("FUEL_TANK_RIGHT_MAIN_QUANTITY", right_gal))

    # 3) Zera tanques auxiliares para evitar conflito
    results.append(write_var("FUEL_TANK_CENTER_QUANTITY", 0))
    results.append(write_var("FUEL_TANK_LEFT_AUX_QUANTITY", 0))
    results.append(write_var("FUEL_TANK_RIGHT_AUX_QUANTITY", 0))

    time.sleep(1)

    readback = {
        "fuel_total_capacity": read_var("FUEL_TOTAL_CAPACITY"),
        "fuel_total_quantity": read_var("FUEL_TOTAL_QUANTITY"),
        "fuel_total_percent": read_var("FUEL_TOTAL_QUANTITY_PERCENT"),
        "left_main": read_var("FUEL_TANK_LEFT_MAIN_QUANTITY"),
        "right_main": read_var("FUEL_TANK_RIGHT_MAIN_QUANTITY"),
        "center": read_var("FUEL_TANK_CENTER_QUANTITY"),
        "left_aux": read_var("FUEL_TANK_LEFT_AUX_QUANTITY"),
        "right_aux": read_var("FUEL_TANK_RIGHT_AUX_QUANTITY"),
    }

    success = any(item["ok"] for item in results)

    return {
        "ok": success,
        "total_fuel_lbs": total_fuel_lbs,
        "total_fuel_gal": total_gal,
        "fuel_percent_target": fuel_percent,
        "results": results,
        "readback": readback,
    }


def apply_briefing(payload):
    fuel_lbs = float(payload.get("fuel_lbs") or 0)
    passenger_weight_kg = float(payload.get("passenger_weight_kg") or 0)
    cargo_weight_kg = float(payload.get("cargo_weight_kg") or 0)
    takeoff_weight_kg = float(payload.get("takeoff_weight_kg") or 0)

    before = {
        "fuel_total_quantity": read_var("FUEL_TOTAL_QUANTITY"),
        "fuel_total_capacity": read_var("FUEL_TOTAL_CAPACITY"),
        "total_weight": read_var("TOTAL_WEIGHT"),
    }

    fuel_result = apply_fuel(fuel_lbs)

    time.sleep(1)

    after = {
        "fuel_total_quantity": read_var("FUEL_TOTAL_QUANTITY"),
        "fuel_total_capacity": read_var("FUEL_TOTAL_CAPACITY"),
        "total_weight": read_var("TOTAL_WEIGHT"),
    }

    if not fuel_result["ok"]:
        raise Exception("Não foi possível aplicar combustível no MSFS.")

    return {
        "fuel": fuel_result,
        "payload": {
            "ok": True,
            "applied_to_sim": False,
            "message": "Peso de passageiros e carga registrado apenas no NORTH OPS.",
            "passenger_weight_kg": passenger_weight_kg,
            "cargo_weight_kg": cargo_weight_kg,
            "takeoff_weight_kg": takeoff_weight_kg,
        },
        "before": before,
        "after": after,
        "applied": {
            "fuel_lbs": fuel_lbs,
            "passenger_weight_kg": passenger_weight_kg,
            "cargo_weight_kg": cargo_weight_kg,
            "takeoff_weight_kg": takeoff_weight_kg,
        },
    }


def command_listener():
    while True:
        try:
            line = sys.stdin.readline()

            if not line:
                time.sleep(0.1)
                continue

            command = json.loads(line)
            command_type = command.get("type")
            request_id = command.get("requestId")

            if command_type == "apply_briefing":
                result = apply_briefing(command.get("payload") or {})

                send({
                    "type": "command_result",
                    "requestId": request_id,
                    "ok": True,
                    "result": result,
                })

        except Exception as e:
            send({
                "type": "command_result",
                "requestId": request_id if "request_id" in locals() else None,
                "ok": False,
                "error": str(e),
            })


def main():
    global sm, aq

    threading.Thread(target=command_listener, daemon=True).start()

    while True:
        try:
            sm = SimConnect()

            # _time=0 força leitura mais atual possível
            aq = AircraftRequests(sm, _time=0)

            time.sleep(3)

            while True:
                aircraft = (
                    read_var("TITLE")
                    or read_var("ATC_MODEL")
                    or read_var("ATC_TYPE")
                    or read_var("ATC_ID")
                )

                latitude = read_var("PLANE_LATITUDE")
                longitude = read_var("PLANE_LONGITUDE")
                altitude_ft = read_var("PLANE_ALTITUDE")
                ground_speed = read_var("GROUND_VELOCITY")
                heading = read_var("PLANE_HEADING_DEGREES_TRUE")
                fuel_percent = read_var("FUEL_TOTAL_QUANTITY_PERCENT")
                fuel_total_quantity = read_var("FUEL_TOTAL_QUANTITY")
                fuel_total_capacity = read_var("FUEL_TOTAL_CAPACITY")
                sim_rate = read_var("SIMULATION_RATE")
                on_ground = read_var("SIM_ON_GROUND")
                engine_running = read_var("GENERAL_ENG_COMBUSTION:1")

                data = {
                    "connected": True,
                    "aircraft": aircraft,
                    "latitude": latitude,
                    "longitude": longitude,
                    "altitude_ft": altitude_ft,
                    "ground_speed": ground_speed,
                    "heading": heading,
                    "fuel_percent": fuel_percent,
                    "fuel_total_quantity": fuel_total_quantity,
                    "fuel_total_capacity": fuel_total_capacity,
                    "sim_rate": sim_rate,
                    "on_ground": bool(on_ground),
                    "engine_running": bool(engine_running),
                }

                send(data)
                time.sleep(2)

        except Exception as e:
            send({
                "connected": False,
                "aircraft": None,
                "latitude": None,
                "longitude": None,
                "altitude_ft": None,
                "ground_speed": None,
                "heading": None,
                "fuel_percent": None,
                "fuel_total_quantity": None,
                "fuel_total_capacity": None,
                "sim_rate": 1,
                "on_ground": False,
                "engine_running": False,
                "error": str(e),
            })

            time.sleep(5)


if __name__ == "__main__":
    main()
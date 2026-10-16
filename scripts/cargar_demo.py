#!/usr/bin/env python3
"""Carga una muestra ficticia en una instalación vacía de La Magia del Cabello.

Usa únicamente la API pública de administración. Requiere una base aislada para
la demostración y se detiene si ya existen datos de negocio.
"""

import argparse
import getpass
import json
import sys
import uuid
from datetime import datetime, time, timedelta
from http.cookiejar import CookieJar
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener
from zoneinfo import ZoneInfo


ZONE = ZoneInfo("America/La_Paz")


def request(opener, base, method, path, body=None, csrf=None):
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    if csrf and method not in ("GET", "HEAD"):
        headers[csrf["headerName"]] = csrf["token"]
    with opener.open(Request(base + path, data=data, headers=headers, method=method)) as response:
        raw = response.read()
        return json.loads(raw) if raw else None


def key():
    return str(uuid.uuid4())


def line(category, length, weight, price):
    return {"categoryCode": category, "lengthCm": length,
            "weight": weight, "pricePerGram": price}


def instant(day, hour):
    return datetime.combine(day, time(hour, 0), tzinfo=ZONE).isoformat()


def empty_installation(opener, base):
    checks = {
        "proveedores": "/api/suppliers",
        "compras": "/api/purchases",
        "ventas": "/api/sales",
        "deudas": "/api/debts",
    }
    occupied = [name for name, path in checks.items()
                if request(opener, base, "GET", path)]
    opening = request(opener, base, "GET", "/api/inventory/opening")
    if opening:
        occupied.append("apertura de inventario")
    if occupied:
        raise ValueError("La instalación ya tiene " + ", ".join(occupied)
                         + ". Usa una base de demostración nueva y vacía.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", required=True,
                        help="Origen de la instalación de demostración, por ejemplo https://demo.example.org")
    args = parser.parse_args()
    parsed = urlparse(args.url)
    local = parsed.hostname in ("localhost", "127.0.0.1")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        parser.error("Usa solo el origen, sin ruta, usuario, contraseña ni parámetros.")
    if parsed.scheme != "https" and not (local and parsed.scheme == "http"):
        parser.error("La instalación remota debe usar HTTPS.")
    base = args.url.rstrip("/")

    print("Destino:", base)
    print("Este programa creará lotes, proveedores, operaciones y deudas ficticios.")
    username = input("Usuario administrador de demostración: ").strip()
    password = getpass.getpass("Contraseña (no se mostrará): ")
    opener = build_opener(HTTPCookieProcessor(CookieJar()))
    csrf = request(opener, base, "GET", "/api/auth/csrf")
    account = request(opener, base, "POST", "/api/auth/login",
                      {"username": username, "password": password}, csrf)
    password = None
    if account.get("role") != "ADMIN" or account.get("mustChangePassword"):
        raise ValueError("Se requiere una cuenta administradora activa sin cambio de clave pendiente.")
    csrf = request(opener, base, "GET", "/api/auth/csrf")
    empty_installation(opener, base)

    categories = {row["code"] for row in request(opener, base, "GET", "/api/catalog/categories")}
    lengths = {row["centimeters"] for row in request(opener, base, "GET", "/api/catalog/lengths")}
    if not {"normal", "premium", "choco"} <= categories or not {38, 40, 60} <= lengths:
        raise ValueError("Faltan categorías o longitudes necesarias en el catálogo inicial.")

    expected = f"CARGAR DEMO EN {parsed.hostname}"
    if input(f"Para confirmar, escribe exactamente «{expected}»: ").strip() != expected:
        print("Operación cancelada sin modificar la base.")
        return

    today = datetime.now(ZONE).date()
    cutoff_day = today - timedelta(days=75)
    opening = {
        "cutoffAt": instant(cutoff_day, 9),
        "lots": [
            {"categoryCode": "normal", "lengthCm": 38, "weight": "1000.00",
             "costPerGram": "2.20", "order": 1,
             "costEstimated": True, "originDate": None, "note": "Lote ficticio de apertura"},
            {"categoryCode": "premium", "lengthCm": 60, "weight": "700.00",
             "costPerGram": "6.80", "order": 2,
             "costEstimated": True, "originDate": None, "note": "Lote ficticio de apertura"},
            {"categoryCode": "choco", "lengthCm": 40, "weight": "500.00",
             "costPerGram": "3.10", "order": 3,
             "costEstimated": True, "originDate": None, "note": "Lote ficticio de apertura"},
        ],
    }
    request(opener, base, "POST", "/api/inventory/opening", opening, csrf)
    print("1/7 Apertura ficticia creada.")

    supplier_a = request(opener, base, "POST", "/api/suppliers",
                         {"name": "Demo · Peluquería Esperanza", "phone": "00000001",
                          "city": "Cochabamba", "address": "", "mapsUrl": ""}, csrf)
    supplier_b = request(opener, base, "POST", "/api/suppliers",
                         {"name": "Demo · Select Hair", "phone": "00000002",
                          "city": "La Paz", "address": "", "mapsUrl": ""}, csrf)
    print("2/7 Proveedores ficticios creados.")

    request(opener, base, "POST", "/api/purchases", {
        "requestKey": key(), "supplierId": supplier_a["id"],
        "operationDate": str(today - timedelta(days=48)),
        "lines": [line("normal", 38, "100.00", "2.30"),
                  line("choco", 40, "100.00", "3.30")],
        "receiveNow": True, "effectiveAt": instant(today - timedelta(days=48), 10),
    }, csrf)
    received = request(opener, base, "POST", "/api/purchases", {
        "requestKey": key(), "supplierId": supplier_a["id"],
        "operationDate": str(today - timedelta(days=6)),
        "lines": [line("normal", 38, "300.00", "2.25"),
                  line("premium", 60, "100.00", "6.60")],
        "receiveNow": True, "effectiveAt": instant(today - timedelta(days=6), 10),
    }, csrf)
    request(opener, base, "POST", "/api/purchases", {
        "requestKey": key(), "supplierId": supplier_b["id"],
        "operationDate": str(today - timedelta(days=3)),
        "lines": [line("premium", 60, "500.00", "6.80"),
                  line("choco", 40, "200.00", "3.20")],
        "receiveNow": False, "effectiveAt": None,
    }, csrf)
    print("3/7 Compras históricas, actual y pendiente creadas.")

    request(opener, base, "POST", f"/api/purchases/{received['summary']['id']}/payments", {
        "requestKey": key(), "paymentDate": str(today - timedelta(days=5)),
        "amount": "500.00", "method": "QR", "reference": "Pago ficticio",
    }, csrf)

    request(opener, base, "POST", "/api/sales", {
        "requestKey": key(), "customerName": "Demo · Estilista del Centro",
        "operationDate": str(today - timedelta(days=42)),
        "lines": [line("normal", 38, "150.00", "3.25"),
                  line("choco", 40, "100.00", "4.60")],
        "effectiveAt": instant(today - timedelta(days=42), 11),
    }, csrf)
    delivered = request(opener, base, "POST", "/api/sales", {
        "requestKey": key(), "customerName": "Demo · Salón Renueva",
        "operationDate": str(today - timedelta(days=4)),
        "lines": [line("normal", 38, "600.00", "3.20"),
                  line("premium", 60, "200.00", "9.70")],
        "effectiveAt": instant(today - timedelta(days=4), 11),
    }, csrf)
    request(opener, base, "POST", "/api/sales/reservations", {
        "requestKey": key(), "customerName": "Demo · Exportadora Andina",
        "operationDate": str(today - timedelta(days=1)),
        "lines": [line("premium", 60, "700.00", "9.70")],
        "acceptPendingStock": True,
    }, csrf)
    print("4/7 Ventas históricas, actual y reserva creadas.")

    request(opener, base, "POST", f"/api/sales/{delivered['summary']['id']}/payments", {
        "requestKey": key(), "paymentDate": str(today - timedelta(days=3)),
        "amount": "2000.00", "method": "CASH", "reference": "Cobro ficticio",
    }, csrf)
    print("5/7 Pago y cobro ficticios registrados.")

    debt = request(opener, base, "POST", "/api/debts", {
        "requestKey": key(), "party": "Demo · Ana Quispe", "phone": "00000003",
        "kind": "RECEIVABLE", "total": "4200.00",
        "openedOn": str(today - timedelta(days=7)),
        "dueOn": str(today + timedelta(days=7)),
        "notes": "Movimiento de efectivo ficticio, independiente del cabello.",
    }, csrf)
    request(opener, base, "POST", f"/api/debts/{debt['debt']['id']}/payments", {
        "requestKey": key(), "paidOn": str(today - timedelta(days=2)),
        "amount": "1000.00", "note": "Abono ficticio",
    }, csrf)
    print("6/7 Deuda y abono ficticios registrados.")

    stock = request(opener, base, "GET", "/api/inventory")
    reports = request(opener, base, "GET", "/api/reports/overview")
    if not stock or not reports.get("salesWithDeliveries"):
        raise ValueError("La carga terminó, pero Inventario o Reportes no muestran los datos esperados.")
    print("7/7 Comprobación básica completada. La base de demostración ya tiene datos.")
    print("Si hubo un fallo parcial, no ejecutes otra vez el script sobre la misma base.")


if __name__ == "__main__":
    try:
        main()
    except (HTTPError, URLError) as error:
        if isinstance(error, HTTPError):
            detail = error.read().decode("utf-8", errors="replace")[:800]
            print(f"Error HTTP {error.code}: {detail}", file=sys.stderr)
        else:
            print(f"Error de conexión: {error.reason}", file=sys.stderr)
        sys.exit(1)
    except (ValueError, KeyError) as error:
        print(f"No se pudo completar la carga: {error}", file=sys.stderr)
        sys.exit(1)

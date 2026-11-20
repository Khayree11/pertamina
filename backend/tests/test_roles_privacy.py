def test_health_and_security_access_boundaries(client, login):
    login("security")
    security_dashboard = client.get("/api/admin/dashboard")
    assert security_dashboard.status_code == 403
    assert client.get("/api/admin/badge").status_code == 403
    assert client.get("/api/admin/review-queue").status_code == 403

    workers = client.get("/api/admin/employees").json()["items"]
    assert workers
    forbidden_list_keys = {"bp_today", "mcu", "urgent", "pending_verifications", "fit_to_drive"}
    assert not forbidden_list_keys.intersection(workers[0])

    worker = next(item for item in workers if item["employee_code"] == "PTM-1001")
    detail = client.get(f"/api/admin/employees/{worker['id']}")
    assert detail.status_code == 200
    body = detail.json()
    assert "fit_to_drive" not in body
    assert body["bp_history"] == []
    assert body["mcu"] == []
    assert body["comorbidities"] == []
    assert all("reasons" not in area for area in body["card"])

    login("klinik")
    assert client.get("/api/admin/dashboard").status_code == 200
    assert client.get("/api/admin/review-queue").status_code == 200
    health_workers = client.get("/api/admin/employees").json()["items"]
    assert "bp_today" in health_workers[0]

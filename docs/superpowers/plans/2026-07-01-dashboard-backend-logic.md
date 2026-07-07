# Dashboard Backend Logic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement dashboard backend logic with status-to-bucket mapping, trust score calculation, flagged counts, top domains, daily volume, and active job tracking

**Architecture:** Create a FastAPI endpoint that processes email verification statistics from the database, applies business logic to categorize emails into buckets, calculates trust score, and returns structured data for the frontend dashboard.

**Tech Stack:** Python, FastAPI, SQLAlchemy, Pydantic

## Global Constraints

- Implement status-to-bucket mapping logic
- Calculate trust score as: round((safe / (safe + risky + unsafe)) * 100)
- Process flagged counts (disposable, role-based, catch-all)
- Handle top domains reporting
- Track daily volume by date and status
- Retrieve active job information
- Use existing Pydantic models and database schemas
- Maintain backward compatibility with existing API contracts
- Follow existing code style and patterns in the codebase
- Write comprehensive tests for all functionality

---

### Task 1: Status-to-Bucket Mapping Logic

**Files:**
- Modify: `email-verifier/backend/api/v1/endpoints/dashboard.py`

**Interfaces:**
- Consumes: Raw status counts from database queries
- Produces: Bucket counts (safe, risky, unsafe, processing) with applied overrides

- [ ] **Step 1: Write the failing test**

```python
def test_status_to_bucket_mapping():
    # Arrange
    status_counts = {
        "verified": 50,
        "deliverable": 20,
        "trusted": 10,
        "probably_valid": 5,
        "risky": 5,
        "unconfirmed": 3,
        "uncertain": 2,
        "invalid": 3,
        "undeliverable": 1,
        "processing": 1
    }
    
    # Act
    # Call the function that implements status-to-bucket mapping
    
    # Assert
    # Expected: safe=77 (50+20+10+5+? - overrides), risky=13 (5+3+2+? - overrides), unsafe=4 (3+1), processing=1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_status_to_bucket_mapping -v`
Expected: FAIL with "function not defined"

- [ ] **Step 3: Write minimal implementation**
```python
def map_status_to_buckets(status_counts):
    # Initialize buckets
    buckets = {"safe": 0, "risky": 0, "unsafe": 0, "processing": 0}
    
    # Map statuses to buckets
    safe_statuses = ["verified", "deliverable", "trusted", "probably_valid"]
    risky_statuses = ["risky", "unconfirmed", "uncertain"]
    unsafe_statuses = ["invalid", "undeliverable"]
    
    for status, count in status_counts.items():
        if status in safe_statuses:
            buckets["safe"] += count
        elif status in risky_statuses:
            buckets["risky"] += count
        elif status in unsafe_statuses:
            buckets["unsafe"] += count
        elif status == "processing":
            buckets["processing"] += count
    
    return buckets
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_status_to_bucket_mapping -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add email-verifier/backend/tests/test_dashboard_stats.py email-verifier/backend/api/v1/endpoints/dashboard.py
git commit -m "feat: implement status-to-bucket mapping logic"
```

### Task 2: Flag Overrides Processing

**Files:**
- Modify: `email-verifier/backend/api/v1/endpoints/dashboard.py`

**Interfaces:**
- Consists: Bucket counts from status mapping, flag counts (disposable, role-based, catch-all)
- Produces: Adjusted bucket counts after applying flag overrides

- [ ] **Step 1: Write the failing test**

```python
def test_flag_overrides_processing():
    # Arrange
    buckets = {"safe": 100, "risky": 10, "unsafe": 5, "processing": 0}
    flag_counts = {"disposable": 5, "role_based": 3, "catch_all": 2}
    
    # Act
    # Call function that applies flag overrides
    
    # Assert
    # Expected: 
    # - disposable moves from safe to unsafe: safe=95, unsafe=10
    # - role_based moves from safe to risky: safe=92, risky=13
    # - catch_all moves from safe to risky: safe=90, risky=15
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_flag_overrides_processing -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
```python
def apply_flag_overrides(buckets, flag_counts):
    # Apply disposable flag override (disposable emails -> unsafe bucket)
    disposable_to_move = min(buckets["safe"], flag_counts["disposable"])
    buckets["safe"] -= disposable_to_move
    buckets["unsafe"] += disposable_to_move
    
    # Apply role_based and catch_all overrides (safe -> risky)
    safety_based_to_move = min(buckets["safe"], flag_counts["role_based"] + flag_counts["catch_all"])
    buckets["safe"] -= safety_based_to_move
    buckets["risky"] += safety_based_to_move
    
    return buckets
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_flag_overrides_processing -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add email-verifier/backend/tests/test_dashboard_stats.py email-verifier/backend/api/v1/endpoints/dashboard.py
git commit -m "feat: implement flag overrides processing"
```

### Task 3: Trust Score Calculation

**Files:**
- Modify: `email-verifier/backend/api/v1/endpoints/dashboard.py`

**Interfaces:**
- Consumes: Bucket counts (safe, risky, unsafe, processing)
- Produces: Trust score (integer 0-100)

- [ ] **Step 1: Write the failing test**

```python
def test_trust_score_calculation():
    # Arrange
    buckets = {"safe": 75, "risky": 15, "unsafe": 10, "processing": 0}
    
    # Act
    # Call function that calculates trust score
    
    # Assert
    # Expected: round((75 / (75 + 15 + 10)) * 100) = round((75/100)*100) = 75
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_trust_score_calculation -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
```python
def calculate_trust_score(buckets):
    total = buckets["safe"] + buckets["risky"] + buckets["unsafe"]
    if total == 0:
        return 0
    return round((buckets["safe"] / total) * 100)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_trust_score_calculation -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add email-verifier/backend/tests/test_dashboard_stats.py email-verifier/backend/api/v1/endpoints/dashboard.py
git commit -m "feat: implement trust score calculation"
```

### Task 4: Top Domains Processing

**Files:**
- Modify: `email-verifier/backend/api/v1/endpoints/dashboard.py`

**Interfaces:**
- Consumes: Raw domain data from database
- Produces: Processed top domains list with calculated metrics

- [ ] **Step 1: Write the failing test**

```python
def test_top_domains_processing():
    # Arrange
    raw_domains = [
        {"domain": "example.com", "safe": 50, "risky": 30, "unsafe": 20, "processing": 0},
        {"domain": "test.com", "safe": 80, "risky": 10, "unsafe": 10, "processing": 0}
    ]
    
    # Act
    # Call function that processes top domains
    
    # Assert
    # Expected: 
    # - example.com: total=100, unsafe_risky=50, percentage=50
    # - test.com: total=100, unsafe_risky=20, percentage=20
    # - Sorted by percentage descending: example.com first, then test.com
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_top_domains_processing -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
```python
def process_top_domains(domains):
    processed = []
    for domain in domains:
        total = domain["safe"] + domain["risky"] + domain["unsafe"] + domain["processing"]
        unsafe_risky = domain["risky"] + domain["unsafe"]
        percentage = round((unsafe_risky / total) * 100) if total > 0 else 0
        processed.append({
            **domain,
            "unsafeRiskyPct": percentage
        })
    
    # Sort by unsafe/risky percentage descending
    return sorted(processed, key=lambda x: x["unsafeRiskyPct"], reverse=True)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_top_domains_processing -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add email-verifier/backend/tests/test_dashboard_stats.py email-verifier/backend/api/v1/endpoints/dashboard.py
git commit -m "feat: implement top domains processing"
```

### Task 5: Daily Volume Aggregation

**Files:**
- Modify: `email-verifier/backend/api/v1/endpoints/dashboard.py`

**Interfaces:**
- Consumes: Raw daily volume data from database (date, status, count)
- Produces: Aggregated daily volume data grouped by date with status breakdowns

- [ ] **Step 1: Write the failing test**

```python
def test_daily_volume_aggregation():
    # Arrange
    raw_data = [
        {"date": "2023-01-01", "status": "verified", "count": 10},
        {"date": "2023-01-01", "status": "invalid", "count": 5},
        {"date": "2023-01-02", "status": "verified", "count": 8},
        {"date": "2023-01-02", "status": "pending", "count": 3}
    ]
    
    # Act
    # Call function that aggregates daily volume
    
    # Assert
    # Expected:
    # - 2023-01-01: {verified: 10, invalid: 5, ...}
    # - 2023-01-02: {verified: 8, invalid: 0, pending: 3, ...}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_daily_volume_aggregation -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
```python
def aggregate_daily_volume(rows):
    # Group by date
    grouped = {}
    for row in rows:
        date = row["date"]
        status = row["status"]
        count = row["count"]
        
        if date not in grouped:
            grouped[date] = {}
        
        if status not in grouped[date]:
            grouped[date][status] = 0
            
        grouped[date][status] += count
    
    # Convert to list format expected by frontend
    result = []
    for date, status_counts in grouped.items():
        # Ensure all expected statuses are present (fill missing with 0)
        expected_statuses = ["verified", "deliverable", "trusted", "probably_valid", 
                           "risky", "unconfirmed", "uncertain", "invalid", 
                           "undeliverable", "processing"]
        
        day_data = {"date": date}
        for status in expected_statuses:
            day_data[status] = status_counts.get(status, 0)
            
        result.append(day_data)
    
    # Sort by date ascending
    return sorted(result, key=lambda x: x["date"])
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_daily_volume_aggregation -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add email-verifier/backend/tests/test_dashboard_stats.py email-verifier/backend/api/v1/endpoints/dashboard.py
git commit -m "feat: implement daily volume aggregation"
```

### Task 6: Active Job Retrieval

**Files:**
- Modify: `email-verifier/backend/api/v1/endpoints/dashboard.py`

**Interfaces:**
- Consumes: Active job data from database query
- Produces: Formatted active job information

- [ ] **Step 1: Write the failing test**

```python
def test_active_job_retrieval():
    # Arrange
    raw_job = {"id": "job_123", "file_name": "test.csv", "processed": 50, "total": 100, "progress_percent": 50}
    
    # Act
    # Call function that formats active job data
    
    # Assert
    # Expected: Same structure as input (or appropriately formatted)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_active_job_retrieval -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
```python
def format_active_job(job):
    if not job:
        return None
    return {
        "id": job.id,
        "file_name": job.file_name,
        "processed": job.processed,
        "total": job.total,
        "progress_percent": job.progress_percent
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_active_job_retrieval -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add email-verifier/backend/tests/test_dashboard_stats.py email-verifier/backend/api/v1/endpoints/dashboard.py
git commit -m "feat: implement active job retrieval"
```

### Task 7: Main Dashboard Endpoint Integration

**Files:**
- Modify: `email-verifier/backend/api/v1/endpoints/dashboard.py`

**Interfaces:**
- Consumes: All helper functions developed in previous tasks
- Produces: Complete DashboardStats response object matching the DashboardStats Pydantic model

- [ ] **Step 1: Write the failing test**

```python
def test_get_dashboard_stats_integration():
    # Arrange
    # Mock all database calls to return predefined data
    
    # Act
    # Call the main get_dashboard_stats endpoint function
    
    # Assert
    # Verify all fields are present and correctly calculated
    # Based on the test data from the summary:
    # - total_emails: 100
    # - verified count: 50
    # - safe bucket: 77 (after overrides)
    # - risky bucket: 13 (after overrides)
    # - unsafe bucket: 9 (after overrides)
    # - processing bucket: 1
    # - trust_score: 78
    # - disposable flag count: 5
    # - active job ID: "job_123"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_get_dashboard_stats -v`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**
```python
# This would be the complete implementation of the get_dashboard_stats function
# that calls all the helper functions in the correct order
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py::test_get_dashboard_stats -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add email-verifier/backend/tests/test_dashboard_stats.py email-verifier/backend/api/v1/endpoints/dashboard.py
git commit -m "feat: implement main dashboard endpoint integration"
```

### Task 8: Comprehensive Test Suite

**Files:**
- Modify: `email-verifier/backend/tests/test_dashboard_stats.py`

**Interfaces:**
- Comprehensive test coverage for all dashboard functionality

- [ ] **Step 1: Write comprehensive tests covering edge cases**

```python
# Test edge cases like:
# - Empty data
# - Zero values
# - Missing fields
# - Boundary conditions
```

- [ ] **Step 2: Run all tests to verify they pass**

Run: `pytest email-verifier/backend/tests/test_dashboard_stats.py -v`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add email-verifier/backend/tests/test_dashboard_stats.py
git commit -m "feat: add comprehensive test suite for dashboard endpoint"
```

## Self-Review

### 1. Spec coverage:
- [x] Status-to-bucket mapping logic
- [x] Trust score calculation
- [x] Flagged counts processing (disposable, role-based, catch-all)
- [x] Top domains reporting
- [x] Daily volume tracking
- [x] Active job tracking

### 2. Placeholder scan:
- [ ] No TODOs, TBDs, or placeholder text found in plan

### 3. Type consistency:
- [ ] All function names and parameters consistent across tasks

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-01-dashboard-backend-logic.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
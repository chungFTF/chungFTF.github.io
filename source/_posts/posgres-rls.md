---
title: PostgreSQL Row Level Security 實踐多租戶系統
date: 2025-07-24 14:01:17
tags: [RLS, Django]
---

> 最近剛好在研究多租戶架構，發現到多租戶架構的實踐方式其實相當多種，今天要來分享如何使用 PostgresSQL Row Level Security 實踐多租戶吧！

## 什麼是多租戶？

多租戶（Multi-tenancy）是一種軟體架構設計，目的是在同一套系統上服務多個獨立使用者（租戶），既能共用系統資源，又能確保資料隔離。  
舉例來說，Slack 本身就是多租戶架構，每個公司（例如 IBM、Grab）都是 Slack 的一個租戶。

## 多租戶資料儲存方式

以資料庫設計來看，常見的幾種多租戶實踐方式：

**獨立模式（Silo）**
- 每個租戶一套獨立資料庫
- 優點：隔離效果最佳
- 缺點：成本高、維護麻煩，每新增租戶都要開新資料庫

**橋接模式（Bridge）**
- 多個租戶共用資料庫，但用不同 schema 分隔
- 優點：節省部分資源
- 缺點：維運與設定相對複雜

**共享模式（Pool）**
- 所有租戶共用同一資料庫與命名空間
- 每個 Table 透過分隔鍵（通常是租戶 ID）來區分
- 優點：成本低、維護簡單、擴展方便
- 缺點：隔離性相對低，風險需要額外控管

> 以下是多租戶模式的比較圖，從左到右維運成本會慢慢降低

> 這篇文章要介紹的 **RLS**，就是針對「共享模式」的具體實例

![多租戶模式比較圖](../img/tenant-modes-comparison.png)

## PostgreSQL Row Level Security（RLS）是什麼？

RLS 是從 Postgres 9.5 後開始支援的，簡單來說，他可以在 DB 曾作出 「誰能看到/修改哪些列」的限制，在預設情況下的 DB Table，如果沒有特別設定策略，就不會特別限制查詢資料列。

以下透過情境來舉例，這樣可以更明白 RLS 如何做同租戶內隔離：

假設我們在做一個連鎖企業管理系統，總店與多家分店共用一套平台，所有分店資料放同一 Table，並透過 `branch_id` 區分：

- **使用者**：
  - 總部管理人員 (HQ)：能看到所有分店資料
  - 分店店長（租戶）：只能看到自己的分店資料

### 沒有 RLS 的情況

分店 A 查自己的營收，需要每次手動加條件：
```sql
SELECT * 
FROM sales 
WHERE branch_id = 'branch_A';
```
總店查所有分店資料：

```sql
SELECT * 
FROM sales;
```

這樣開發會有一些風險：
1. SQL 漏寫 -> 忘記加上 WHERE 條件，就會讓分店看到其他分店的資料
2. 維護複雜 -> 要特別寫管理者專用 SQL 才能看到多分店資料

這時候，RLS 的優勢就可以用在這邊了！

RLS 可以把它想像成：
> **「資料庫自動幫你加上 WHERE tenant_id = …，而且無法繞過」**

我們可以透過以下指令啟用 RLS：
```sql
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY branch_isolation_policy ON sales
USING (branch_id = current_setting('app.current_branch')::UUID);
```

登入時，設定 Session 參數：

```sql
SET app.current_branch = 'branch_A';
```
此後，分店 A 查詢：

```sql
SELECT * FROM sales; ---- 自動過濾，只會回傳分店 A 的資料
```


所以可以知道 RLS 的好處在於
- 資料隔離：各分店數據完全隔離，避免誤查或惡意存取
- 開發簡化：不再到處手動加 WHERE branch_id = ?，降低遺漏風險
- 可擴展：新增 1000 家分店也不用修改資料庫 TABLE 架構或程式邏輯

## Django 實踐 RLS

接下來說明如何在 Django 框架中實作 RLS 多租戶隔離系統。

[原始碼在這ㄦ](https://github.com/chungFTF/django-rls-multitenant)

這邊的程式碼主要用來展示 RLS 功能，其他像是使用者認證、權限管理等安全細節就不深入探討了，畢竟 Django 本身的功能很豐富，寫起來會太複雜 :p

對 Django 不熟的朋友建議先了解基本的 [Django 觀念](https://developer.mozilla.org/zh-TW/docs/Learn_web_development/Extensions/Server-side/Django/Introduction)

#### 檔案架構
```
django-rls-multitenant/
├── .env                    # 環境變數設定
├── config/
│   └── docker-compose.yaml  # 容器編排設定
├── scripts/
│   ├── init.sql            # 資料庫初始化腳本
│   └── test_rls.sql        # 測試資料產生腳本 （AI 產出的，快速又方便）
├── tenants/
│   ├── models.py           # Branch 和 Sales 資料模型
│   ├── middleware.py       # 分店上下文中介軟體
│   ├── views.py            # API 視圖邏輯
│   └── migrations/         # Django 資料庫遷移檔案
└── rls_project/
    └── settings.py         # Django 專案設定
```

**資料庫角色結構**
```
app_user (Django 應用連線用戶) 
    ↓ 繼承
app_role (應用角色)
```

- **Table 擁有者**: `postgres` (管理員) - 防止 RLS 繞過機制
- **應用連接**: `app_user` - 受 RLS 策略完全限制
- **強制 RLS**: 確保所有用戶都受策略約束


---
在實作 PoC 的時候 Docker 真的很方便，之後來寫一篇關於 Docker 學習的心路歷程好了（BUT 我還在初學者階段 XDD）

1. 進入目錄，啟動容器服務
   ```bash
   cd django-rls-multitenant/config
   docker-compose up -d
   ```

2. 初始化 DB 
   ```bash
   cat ../scripts/init.sql | docker-compose exec -T postgres psql -U postgres -d rls_db
   ```
   
   **init.sql 的作用：**
   - 建立 `app_role` 和 `app_user` (Django 連 DB 用的帳號)
   - 建立 `get_current_branch_id()` 函數 (RLS 策略會用到)
   - 設定基本權限

3. 進入 Django 容器
   ```bash
   docker-compose exec web bash
   ```

4. 執行 Django 資料庫 migration 

    注意：使用 postgres 身份建立表格

    ```bash
    DB_USER=postgres DB_PASSWORD=postgres python manage.py migrate
    ```

5. 創建 RLS 策略 migration
   ```bash
   # 檢查是否已有 RLS migration
   python manage.py showmigrations tenants
   
   # 如果沒有 enable_rls migration，需要創建空的 migration 檔案，並貼上 RLS 策略
   python manage.py makemigrations --empty tenants --name enable_rls
   ```

   這部分我把 RLS 策略寫在 Django migration 裡，好處是可以跟著專案版本一起管理，這樣開發、測試、正式環境都能用同一套指令部署，而且如果策略有問題還能回滾。
   
   另外可以確保 Table 先建好，再套用 RLS 策略，避免順序錯亂的問題。

    建立好空的 migration 檔案後，編輯 `tenants/migrations/0002_enable_rls.py`，貼上以下 RLS 策略：

    ```python
    from django.db import migrations


    class Migration(migrations.Migration):

        dependencies = [
            ('tenants', '0001_initial'),
        ]

        operations = [
            migrations.RunSQL(
                sql="""
                -- Transfer table ownership to postgres (admin)
                ALTER TABLE tenants_branch OWNER TO postgres;
                ALTER TABLE tenants_sales OWNER TO postgres;
                
                -- Enable RLS for Branch table
                ALTER TABLE tenants_branch ENABLE ROW LEVEL SECURITY;
                ALTER TABLE tenants_branch FORCE ROW LEVEL SECURITY;
                
                -- Simple branch access policy
                CREATE POLICY branch_access_policy ON tenants_branch
                    FOR ALL
                    TO app_role
                    USING (id = get_current_branch_id());
                
                -- Enable RLS for Sales table  
                ALTER TABLE tenants_sales ENABLE ROW LEVEL SECURITY;
                ALTER TABLE tenants_sales FORCE ROW LEVEL SECURITY;
                
                -- Simple sales isolation policy
                CREATE POLICY sales_branch_isolation ON tenants_sales
                    FOR ALL
                    TO app_role
                    USING (branch_id = get_current_branch_id());
                
                -- Grant permissions to app_role (not ownership)
                REVOKE ALL ON tenants_branch FROM PUBLIC;
                REVOKE ALL ON tenants_sales FROM PUBLIC;
                
                GRANT SELECT, INSERT, UPDATE, DELETE ON tenants_branch TO app_role;
                GRANT SELECT, INSERT, UPDATE, DELETE ON tenants_sales TO app_role;
                GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_role;
                """,
                reverse_sql="""
                -- Remove RLS policies
                DROP POLICY IF EXISTS branch_access_policy ON tenants_branch;
                DROP POLICY IF EXISTS sales_branch_isolation ON tenants_sales;
                
                -- Disable RLS
                ALTER TABLE tenants_branch DISABLE ROW LEVEL SECURITY;
                ALTER TABLE tenants_sales DISABLE ROW LEVEL SECURITY;
                
                -- Restore ownership and permissions
                ALTER TABLE tenants_branch OWNER TO app_user;
                ALTER TABLE tenants_sales OWNER TO app_user;
                GRANT ALL ON tenants_branch TO PUBLIC;
                GRANT ALL ON tenants_sales TO PUBLIC;
                """
            )
        ]

    ```

6. 執行 RLS migration 來應用策略
   ```bash
   DB_USER=postgres DB_PASSWORD=postgres python manage.py migrate
   ```

7. 產生測試資料

    為了時間方便，請 AI 幫我產生測試資料，直接執行起來方便許多～

    ```bash
    cat ../scripts/test_rls.sql | docker-compose exec -T postgres psql -U postgres -d rls_db
    ```

    執行後應產生：
    - 3 個分店資料 (西門、東區、板橋)
    - 每個分店 20 筆銷售記錄
    - 總計 60 筆銷售記錄

### 確認 RLS 功能生效

接下來，測試看看租戶之間能不能達到隔離效果

首先，假設你是系統管理員 `postgres` ，你可以取得所有租戶的資料：

```bash
docker-compose exec postgres psql -U postgres -d rls_db -c "SELECT id, name, code FROM tenants_branch ORDER BY code;"
```
結果：
```
                  id                  |   name   | code  
--------------------------------------|----------|-------
01e9ff22-d020-42f7-9045-6c2b74df1ccb | 西門分店 | BR001
b4b465c4-8485-4225-af37-9f5d6432e1ef | 東區分店 | BR002
cb31e356-84f8-4f81-a58c-9c86caf08a8a | 板橋分店 | BR003
```

接著拿到不同分店的 ID，就可以測試 Django API 了！
我這邊用 curl 來測試：

> Django 執行時使用的是 `app_user`，受到 RLS 策略限制，所以不會看到其他租戶的資料


```bash
# 檢查分店上下文
curl -s -H "X-Branch-ID: 01e9ff22-d020-42f7-9045-6c2b74df1ccb" \
     http://localhost:8000/api/context-status/ | jq
```

API 結果
```json
{
  "context": {
    "current_user": "app_user",
    "current_branch_id": "01e9ff22-d020-42f7-9045-6c2b74df1ccb",
    "user_type": "Branch User"
  },
  "visibility": {
    "branches": 1,
    "sales": 20
  },
  "request_branch_id": "01e9ff22-d020-42f7-9045-6c2b74df1ccb"
}
```


```bash
# 檢查銷售資料
curl -s -H "X-Branch-ID: 01e9ff22-d020-42f7-9045-6c2b74df1ccb" \
     http://localhost:8000/api/sales/ | jq
```

API 結果
```json
{
  "sales": [
    {
      "id": "fd281cb8-665f-4d42-831e-c080d858a991",
      "branch_name": "西門分店",
      "date": "2025-07-25",
      "amount": "9186.00",
      "transaction_count": 16,
      "product_category": "飲料"
    },
    {
      "id": "c9fb589c-e2b7-4031-b647-3c21f5a36d04",
      "branch_name": "西門分店",
      "date": "2025-07-24",
      "amount": "8980.00",
      "transaction_count": 17,
      "product_category": "配菜"
    },
    ... skip ...
  ],
  "count": 20,
  "total_amount": "240058.00",
  "current_branch_id": "01e9ff22-d020-42f7-9045-6c2b74df1ccb"
}
```

預期回應
- `visibility.branches`: 1 (僅可見自己的分店)
- `visibility.sales`: 20 (僅可見自己的銷售記錄)
- 所有銷售記錄的 `branch_name` 皆為 "西門分店"

**測試不同分店的隔離效果**
```bash
# 使用東區分店的 ID 測試
curl -s -H "X-Branch-ID: b4b465c4-8485-4225-af37-9f5d6432e1ef" \
     http://localhost:8000/api/sales/ | jq
```

結果會發現
- 一樣只能看到 1 個分店、20 筆記錄
- 所有記錄都是 "東區分店" 的資料
- 總銷售額跟西門分店完全不一樣

**試試看如果隨便輸入 id**
```bash
# 用假的分店 ID 測試
curl -s -H "X-Branch-ID: 11111111-1111-1111-1111-111111111111" \
     http://localhost:8000/api/sales/

# 不給分店 ID 測試
curl -s http://localhost:8000/api/sales/
```

系統會正確拒絕：
- 假 ID：`{"error": "Invalid branch"}`
- 沒給 ID：`{"error": "Branch ID required"}`

---

以上就是使用 PostgreSQL RLS 實踐多租戶系統的完整流程 （寫完發現挺累的 XD）

我個人認為，RLS 雖然不是多租戶架構的萬能解法，但在「共享模式」的多租戶設計中，確實一個不錯的使用工具。

對於想要快速構建一個多租戶的平台（SaaS, 多分電管以系統），或許是不錯的選擇！

## 參考資料

[1] https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/

[2] https://www.postgresql.org/docs/current/ddl-rowsecurity.html

[3] https://docs.djangoproject.com/en/stable/topics/db/multi-db/
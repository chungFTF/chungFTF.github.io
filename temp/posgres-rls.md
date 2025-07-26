---
title: PostgreSQL Row Level Security 實踐多租戶系統
date: 2025-07-24 14:01:17
tags:
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
- 每個資料表透過分隔鍵（通常是租戶 ID）來區分
- 優點：成本低、維護簡單、擴展方便
- 缺點：隔離性相對低，風險需要額外控管

> 從左到右，隔離強度逐漸降低，但維運成本也降低
> 這篇文章要介紹的 **RLS**，就是針對「共享模式」的具體實例

![多租戶模式比較圖](../source/img/tenant-modes-comparison.png)

## PostgreSQL Row Level Security（RLS）是什麼？


RLS 是從 Postgres 9.5 後開始支援的，簡單來說，他可以在 DB 曾作出 「誰能看到/修改哪些列」的限制，在預設情況下的 DB Table，如果沒有特別設定策略，就不會特別限制查詢資料列。

以下透過情境來舉例，這樣可以更明白 RLS 如何做同租戶內隔離：

假設我們在做一個連鎖企業管理系統，總店與多家分店共用一套平台，所有分店資料放同一張表，並透過 `branch_id` 區分：

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

而總店同樣可以使用相同的查詢語法存取所有分店資料，不需要額外改寫 SQL，只要 Session 設定或策略不同即可。

所以可以知道 RLS 的好處在於
- 資料隔離：各分店數據完全隔離，避免誤查或惡意存取
- 開發簡化：不再到處手動加 WHERE branch_id = ?，降低遺漏風險
- 可擴展：新增 1000 家分店也不用修改資料庫 TABLE 架構或程式邏輯




參考資料：
[1] https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/
[2] https://www.postgresql.org/docs/current/ddl-rowsecurity.html
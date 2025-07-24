---
title: PostgresSQL Row Level Security 實踐多租戶系統
date: 2025-07-24 14:01:17
tags:
---

> 最近剛好在研究多租戶架構，發現到多租戶架構的實踐方式其實相當多種，今天要來分享如何使用 PostgresSQL Row Level Security 實踐多租戶吧！

## 何謂多租戶技術？

多租戶 (Multi-tenantcy technology) 是一種軟體設計架構，實作如何在多個不同使用者（租戶）的環境下，讓使用者共用相同的城市、系統資源，並且確保每個使用者的資料都能夠隔離。
舉例來說，Slack 就是多租戶服務的提供者，而使用 Slack 的用戶（如：IBM, Grab ）這些都是租戶。

## 如何實踐多租戶技術？

以資料儲存角度來說，多租戶可以有很多實踐的方式：

1. 獨立模式 (Silo)
   每個租戶獨立使用自己的資料庫

2. 橋接模式 (Bridge)
   多個租戶共用資料庫，以 schema 分割租戶之間的資料

3. 共享模式 (Pool)
   多個租戶共用資料庫實例與命名空間

其中維護方式由左到右複雜度越低

## Postgres Row Level Security (RLS)

參考資料：
https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/

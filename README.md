# corgihere 行事曆

靜態頁面。完成、備註和自訂事項存在開啟它的那一個瀏覽器。

公開網址：https://corgihere.github.io/schedule/

## 接到 corgihere.ddns.net

No-IP 的免費主機名稱只有一筆 A 紀錄，不能設成 CNAME。GitHub Pages 需要四筆 A 紀錄，或一筆指到 `corgihere.github.io` 的 CNAME。

可以先用上面的 GitHub 網址，它有 HTTPS。

若要網址列維持 `corgihere.ddns.net`：

1. 關掉 No-IP 的自動更新，避免它把位址改回 `140.114.87.235`。
2. 在 No-IP 把 `corgihere.ddns.net` 的 IP 改成 `185.199.108.153`。
3. 改完之後，再到這個 repo 的 Settings → Pages 把 Custom domain 設成 `corgihere.ddns.net`。

另一個做法是在 No-IP 把主機改成網址轉址，轉到 `https://corgihere.github.io/schedule/`。網址列會變成 GitHub 的網址，但不用改 IP。

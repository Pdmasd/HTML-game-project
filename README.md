# Oẳn Tù Tì v2 (OTTv2) — HTML game

Game 2 người chơi trên bàn cờ 9×9.  Mỗi quân là Đấm ✊ / Lá ✋ / Kéo ✌
di chuyển 1 ô theo 8 hướng như quân Vua trong cờ vua.

## Luật

- **Ăn quân**: theo Oẳn Tù Tì (Đấm > Kéo, Kéo > Lá, Lá > Đấm).
- **Cùng loại**: chỉ chặn nhau, không ăn được.
- **Thua RPS**: không được đi vào ô đó.
- **Thắng**: (a) ăn sạch một loại quân của đối phương, **hoặc** (b) đưa quân
  vào ô đích của mình — P1 (đỏ) đích = **i9**, P2 (xanh) đích = **a1**.

## Chạy

Cần Node.js ≥ 18.

```bash
npm install
npm start
```

Mở https://html-game-project.onrender.com/ trong trình duyệt.  Server tĩnh + Socket.IO
đều do `server.js` phục vụ.

Chế độ **Hotseat** (2 người 1 máy) cũng chạy tốt nếu bạn chỉ mở thẳng
`index.html` — chỉ chế độ **Online** cần server đang chạy.

## Các chế độ chơi

- **Hotseat** (mặc định): 2 người chơi lần lượt trên cùng một máy.
- **Trực tuyến (Socket.IO)**: bấm radio "Trực tuyến" ở đầu trang.
  - Người 1 bấm **Tạo phòng mới** — nhận **mã phòng 5 ký tự**.
  - Người 2 nhập mã đó vào ô rồi bấm **Vào phòng**.
  - Người 1 luôn là Đỏ (đi trước), Người 2 là Xanh.
  - Server (`server.js`) chỉ relay nước đi giữa 2 client, giữ một ảnh
    state gần nhất để đồng bộ khi có người vào giữa chừng.

## Triển khai lên Vercel

Vercel là serverless — chỉ host được **phần tĩnh** (client).  Server
Socket.IO cần chỗ chạy 24/7 (Render/Railway/Fly...), không hợp Vercel.

1. **Deploy client lên Vercel** (chỉ vài giây):
   - Vào https://vercel.com/new
   - Import repo `Pdmasd/HTML-game-project`
   - Bấm **Deploy** — không cần cấu hình gì thêm (đã có `vercel.json`).
   - Xong có URL kiểu `https://html-game-project.vercel.app`.

2. **Deploy server Socket.IO lên Render** (miễn phí):
   - Vào https://dashboard.render.com/select-repo?type=blueprint
   - Chọn repo này → Render đọc `render.yaml` tự deploy → có URL kiểu
     `https://ottv2-server-xxxx.onrender.com`.

3. **Kết nối 2 phần** — chọn 1 trong 2 cách:
   - **Sửa code**: mở [index.html](index.html) sửa
     `window.OTT_SERVER_URL = "https://ottv2-server-xxxx.onrender.com";`
     rồi push lại → Vercel tự deploy phiên bản mới.
   - **Không sửa code**: người chơi mở
     `https://html-game-project.vercel.app/?server=https://ottv2-server-xxxx.onrender.com`
     — client lưu vào `localStorage`, các lần sau vào thẳng URL Vercel là được.

## Triển khai lên GitHub Pages

GitHub Pages chỉ phục vụ tĩnh, nên bạn cần **deploy `server.js` riêng** ở nơi
khác (Render, Railway, Fly.io, Glitch, VPS...).  Sau đó:

1. Trong `index.html` sửa dòng `window.OTT_SERVER_URL = "";` thành URL server
   đã deploy, ví dụ `window.OTT_SERVER_URL = "https://ottv2.onrender.com";`
2. Trong repo GitHub → **Settings → Pages** → Source = `Deploy from a branch`
   → Branch = `main` / folder = `/ (root)` → Save.
3. Sau vài phút trang có ở `https://<user>.github.io/<repo>/`.

Bạn cũng có thể mở tạm với query string:
`https://<user>.github.io/<repo>/?server=https://ottv2.onrender.com`

## Cấu trúc

- `server.js` — server Express + Socket.IO (quản lý phòng theo mã).
- `package.json` — dependencies (`express`, `socket.io`).
- `index.html` — layout & UI.
- `style.css` — theme tối, bàn cờ, quân, highlight, lobby.
- `game.js` — engine game (state, luật, render, tương tác).
- `multiplayer.js` — lớp mạng client (Socket.IO, tạo/vào phòng bằng mã).

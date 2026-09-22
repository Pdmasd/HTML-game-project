import { playhtml } from "https://unpkg.com/playhtml";

const STATE_ID = "ott-online-state";

let onlineHandle = null;

const defaultData = {
    game: null,
    player1: null,
    player2: null
};


// ========================================
// Đăng ký shared state
// ========================================

onlineHandle = playhtml.register(STATE_ID, {

    defaultData,

    updateElement: ({ data }) => {

        if (!data || !data.game) return;

        // Nhận trạng thái game từ PlayHTML
        if (window.OTT && window.OTT.loadFrom) {
            window.OTT.loadFrom(data.game);
        }

        updateOnlineStatus(data);
    }
});


// ========================================
// Khởi động PlayHTML
// ========================================

playhtml.init();


// ========================================
// Hiển thị trạng thái online
// ========================================

function updateOnlineStatus(data) {

    const status =
        document.getElementById("onlineStatus");

    if (!status) return;

    let text = "";

    if (data.player1) {
        text += "P1 đã vào phòng. ";
    }

    if (data.player2) {
        text += "P2 đã vào phòng.";
    }

    if (!text) {
        text = "Đang chờ người chơi...";
    }

    status.textContent = text;
}


// ========================================
// Tham gia Player 1
// ========================================

function joinPlayer1() {

    onlineHandle.setData(data => {

        if (!data.player1) {
            data.player1 = true;
        }

        if (!data.game && window.OTT) {
            data.game = window.OTT.serialize();
        }

    });

    window._online.active = true;
    window._online.myPlayer = 1;

    updateMyPlayer();
}


// ========================================
// Tham gia Player 2
// ========================================

function joinPlayer2() {

    onlineHandle.setData(data => {

        if (!data.player2) {
            data.player2 = true;
        }

        if (!data.game && window.OTT) {
            data.game = window.OTT.serialize();
        }

    });

    window._online.active = true;
    window._online.myPlayer = 2;

    updateMyPlayer();
}


// ========================================
// Hiển thị player hiện tại
// ========================================

function updateMyPlayer() {

    const info =
        document.getElementById("myPlayer");

    if (!info) return;

    info.textContent =
        `Bạn là Player ${window._online.myPlayer}`;
}


// ========================================
// Gửi nước đi
// ========================================

function broadcastMove() {

    if (!window.OTT) return;

    const game =
        window.OTT.serialize();

    onlineHandle.setData(data => {

        data.game = game;

    });
}


// ========================================
// New Game
// ========================================

function broadcastNew() {

    // Chỉ P1 được reset game online
    if (window._online.myPlayer !== 1) {
        return;
    }

    if (!window.OTT) return;

    const game =
        window.OTT.serialize();

    onlineHandle.setData(data => {

        data.game = game;

    });
}


// ========================================
// API dùng bởi game.js
// ========================================

window._online = {

    active: false,

    myPlayer: null,

    broadcastMove,

    broadcastNew

};


// ========================================
// Nút Player 1 / Player 2
// ========================================

document.addEventListener("DOMContentLoaded", () => {

    const p1 =
        document.getElementById("joinP1");

    const p2 =
        document.getElementById("joinP2");


    if (p1) {
        p1.addEventListener(
            "click",
            joinPlayer1
        );
    }


    if (p2) {
        p2.addEventListener(
            "click",
            joinPlayer2
        );
    }

});
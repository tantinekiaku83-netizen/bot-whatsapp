const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');

// ⚠️ COLOCA AQUI O TEU NÚMERO COM INDICATIVO DO PAÍS (SEM O SINAL DE +)
// Exemplo para Angola: "2449XXXXXXXX"
const NUMERO_TELEFONE = "244931174162"; 

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Se ainda não estiver registado e tentar gerar a conexão, pede o código de 8 dígitos
        if (qr && !sock.authState.creds.registered) {
            setTimeout(async () => {
                try {
                    let code = await sock.requestPairingCode(NUMERO_TELEFONE);
                    code = code?.match(/.{1,4}/g)?.join("-") || code;
                    console.log("\n========================================");
                    console.log(`🔑 O TEU CÓDIGO DE EMPARELHAMENTO: ${code}`);
                    console.log("========================================\n");
                } catch (error) {
                    console.error("Erro ao solicitar código de emparelhamento:", error);
                }
            }, 3000);
        }

        if (connection === 'open') {
            console.log('✅ Bot conectado com sucesso!');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada. A reiniciar...', shouldReconnect);
            if (shouldReconnect) {
                start();
            }
        }
    });

    // Apagar mensagens de grupos automaticamente
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];

        if (!msg.key.fromMe && msg.key.remoteJid.endsWith('@g.us')) {
            try {
                await sock.sendMessage(msg.key.remoteJid, { delete: msg.key });
                console.log(`🗑️ Mensagem apagada no grupo: ${msg.key.remoteJid}`);
            } catch (err) {
                console.error("Erro ao apagar mensagem:", err);
            }
        }
    });
}

start();

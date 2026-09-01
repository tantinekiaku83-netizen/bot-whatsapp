cat << 'EOF' > index.js
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

async function start() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, qr } = update;
        if (qr) qrcode.generate(qr, { small: true });
        if (connection === 'open') console.log('✅ Bot conectado com sucesso!');
        if (connection === 'close') {
            console.log('Conexão fechada, reiniciando...');
            start();
        }
    });

    // 1. EVENTO DE BOAS-VINDAS
    sock.ev.on('group-participants.update', async (update) => {
        if (update.action === 'add') {
            try {
                const meta = await sock.groupMetadata(update.id);
                const totalMembros = meta.participants.length;
                
                const hoje = new Date();
                const dia = String(hoje.getDate()).padStart(2, '0');
                const mes = String(hoje.getMonth() + 1).padStart(2, '0');
                const ano = hoje.getFullYear();
                const dataFormatada = `${dia}/${mes}/${ano}`;

                for (const p of update.participants) {
                    const participantId = typeof p === 'string' ? p : p.id;
                    const num = participantId.split('@')[0];

                    const mensagem = 
`╭─❍ ( ${meta.subject} )❍─╮

Saudações @${num}! 🎉
Bem-vindo(a) ao grupo, fixe ter-te aqui!

┌ Grupo: *${meta.subject}*
┌ Membro nº: *${totalMembros}*
└ Entrou em: *${dataFormatada}*

📖 Lê as regras na biografia
⚡ Seja Bem Vindo!!
╰──────────────────╯`;

                    await sock.sendMessage(update.id, { 
                        text: mensagem, 
                        mentions: [participantId] 
                    });
                }
            } catch (err) {
                console.error('Erro nas boas-vindas:', err);
            }
        }
    });

    // 2. EVENTO DE ANTI-LINK (REMOÇÃO AUTOMÁTICA)
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg || !msg.message || msg.key.fromMe) return;

            const from = msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            if (!isGroup) return;

            // Extrai o texto da mensagem
            const text = msg.message.conversation || 
                         msg.message.extendedTextMessage?.text || 
                         msg.message.imageMessage?.caption || 
                         msg.message.videoMessage?.caption || '';

            // Expressão regular para detetar URLs e links de WhatsApp
            const linkRegex = /(https?:\/\/[^\s]+)|(chat\.whatsapp\.com\/[^\s]+)|(wa\.me\/[^\s]+)/gi;

            if (linkRegex.test(text)) {
                const sender = msg.key.participant || msg.key.remoteJid;
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;

                // Verifica se quem enviou é admin
                const senderAdmin = participants.find(p => (p.id === sender))?.admin;
                const isAdmin = senderAdmin === 'admin' || senderAdmin === 'superadmin';

                if (!isAdmin) {
                    console.log(`[ANTI-LINK] Link detetado de ${sender}. A remover...`);

                    // 1. Apaga a mensagem com o link
                    await sock.sendMessage(from, { delete: msg.key });

                    // 2. Remove (bane) o utilizador
                    await sock.groupParticipantsUpdate(from, [sender], 'remove');

                    // 3. Envia aviso no grupo
                    const num = sender.split('@')[0];
                    await sock.sendMessage(from, { 
                        text: `⚠️ @${num} foi removido por enviar links no grupo! Links só são permitidos para administradores.`,
                        mentions: [sender]
                    });
                }
            }
        } catch (err) {
            console.error('Erro no Anti-Link:', err);
        }
    });
}
start();
EOF

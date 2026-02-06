import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers,
    delay
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { handleMessage } from './handlers/replyDetector.js';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Bot {
    constructor() {
        this.sock = null;
        this.reconnectAttempts = 0;
    }

    async start() {
        try {
            console.clear();
            console.log('╔════════════════════════════════════════╗');
            console.log('║         🦖 ONCEVIEW FANTASMA           ║');
            console.log('║      Modo: SÓLO CONSOLA (100% silencio)║');
            console.log('╚════════════════════════════════════════╝\n');

            // Inicializar sesión
            console.log('📁 Cargando sesión...');
            const { state, saveCreds } = await useMultiFileAuthState(
                join(__dirname, 'session')
            );

            console.log('🔌 Conectando a WhatsApp...');

            // 🎯 IMPORTANTE: pino() no solo { level: 'silent' }
            this.sock = makeWASocket({
                logger: pino({ level: 'silent' }),  // ✅ CORRECTO
                printQRInTerminal: false,
                auth: state,
                markOnlineOnConnect: false,
                syncFullHistory: false,
                browser: Browsers.macOS('Safari'),
                version: [2, 3000, 1027934701]
            });

            this.setupEventHandlers(saveCreds);

        } catch (error) {
            console.error('❌ Error al iniciar:', error.message);
            await this.reconnect();
        }
    }

    setupEventHandlers(saveCreds) {
        const sock = this.sock;

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'connecting' && !sock.authState.creds.registered) {
                console.log('\n📱 SOLICITANDO PAIRING CODE...\n');
                const phoneNumber = await this.askForPhoneNumber();
                if (phoneNumber) {
                    try {
                        const code = await sock.requestPairingCode(phoneNumber);
                        this.showPairingCode(code);
                    } catch (error) {
                        console.error('❌ Error con el código:', error.message);
                        process.exit(1);
                    }
                }
            }

            if (connection === 'open') {
                this.reconnectAttempts = 0;
                console.log('✅ CONECTADO A WHATSAPP');
                console.log(`📱 Número: ${sock.user?.id?.split(':')[0] || 'N/A'}`);
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
                console.log('💡 Escribe "onov" en tu chat privado');
                console.log('   para activar la detección.\n');
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === DisconnectReason.loggedOut) {
                    console.error('🔒 SESIÓN CERRADA - Borra carpeta "session"');
                    process.exit(0);
                } else {
                    console.log('⚠️  Desconectado. Reconectando en 10s...');
                    setTimeout(() => this.reconnect(), 10000);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const message of messages) {
        if (!message?.message) continue

        const remoteJid = message.key.remoteJid
        if (remoteJid === 'status@broadcast' || remoteJid.includes('broadcast')) {
            continue
        }

        // Comandos públicos (.say para todos)
        const { handleCommands } = await import('./handlers/commandHandler.js')
        await handleCommands(message, sock, config)

        // Luego el modo onceview (solo owner)
        await handleMessage(message, sock, config)
    }
});
    }

    async askForPhoneNumber() {
        const readline = createInterface({
            input: process.stdin,
            output: process.stdout
        });

        return new Promise((resolve) => {
            console.log('📝 Ingresa tu número de WhatsApp:');
            console.log('   Ejemplo: 593********* (sin +)\n');

            readline.question('👉 Número: ', (answer) => {
                readline.close();
                const cleaned = answer.replace(/\D/g, '');
                if (cleaned.length >= 10) {
                    console.log(`✅ Aceptado: ${cleaned}\n`);
                    resolve(cleaned);
                } else {
                    console.log('❌ Número inválido\n');
                    resolve(null);
                }
            });
        });
    }

    showPairingCode(code) {
        console.clear();
        console.log('╔════════════════════════════════════════╗');
        console.log('║             🔢 PAIRING CODE            ║');
        console.log('╚════════════════════════════════════════╝\n');
        console.log('📱 EN WHATSAPP:');
        console.log('1. Ve a Ajustes → Dispositivos vinculados');
        console.log('2. Toca "Vincular un dispositivo"');
        console.log('3. Selecciona "Vincular con código"\n');
        console.log('──────────────────────────────────────────');
        console.log(`          🔢 TU CÓDIGO: ${code}`);
        console.log('──────────────────────────────────────────\n');
        console.log('⏳ Esperando confirmación...\n');
    }

    async reconnect() {
        if (this.reconnectAttempts >= 5) {
            console.error('❌ LÍMITE DE RECONEXIONES');
            process.exit(1);
        }

        this.reconnectAttempts++;
        const delayTime = 10000;
        console.log(`🔄 Reintento ${this.reconnectAttempts}/5`);
        await delay(delayTime);
        await this.start();
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 Bot detenido');
    process.exit(0);
});

const bot = new Bot();
bot.start().catch(console.error);
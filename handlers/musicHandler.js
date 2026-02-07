// handlers/musicHandler.js - FINAL REAL: BÚSQUEDA NOMBRE CON LINK CONSTRUIDO 2026

import youtubedl from 'youtube-dl-exec'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import fetch from 'node-fetch'
import tmp from 'tmp-promise'
import fs from 'fs'

ffmpeg.setFfmpegPath(ffmpegStatic)

console.log('[musicHandler] Cargado OK - BÚSQUEDA NOMBRE CON LINK CONSTRUIDO FINAL 2026')

const MAX_DURATION_SEC = 600
const MAX_SIZE_MB_APROX = 16

export async function handleMusic(message, sock, config) {
    const { key, message: msg } = message
    const jid = key.remoteJid

    let text = ''
    if (msg?.conversation) text = msg.conversation.trim()
    else if (msg?.extendedTextMessage?.text) text = msg.extendedTextMessage.text.trim()

    if (!text) return

    const lower = text.toLowerCase().trim()
    const prefixes = ['.yt', '.play', '.p']
    const matchedPrefix = prefixes.find(p => lower.startsWith(p + ' ') || lower === p)

    if (!matchedPrefix) return

    let query = text.slice(matchedPrefix.length).trim()

    if (!query) {
        await sock.sendMessage(jid, { text: 'Ej: .yt roddy ricch the box   o link directo' })
        return
    }

    console.log(`[music] Comando: ${matchedPrefix} | Query: "${query}"`)

    let tempInputFile = null
    let tempOutputFile = null

    try {
        let audioUrl
        let title = 'Sin título'
        let duration = 0

        const commonOpts = {
            noPlaylist: true,
            noWarnings: true,
            preferFreeFormats: true,
            format: 'bestaudio[ext=m4a]/bestaudio/best',
            addHeader: [
                'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
                'Referer:https://www.youtube.com/'
            ]
        }

        const isSearch = !/^https?:\/\//i.test(query) && !/youtu\.?be/i.test(query)

        if (isSearch) {
            console.log('[music] BÚSQUEDA por nombre')
            // Obtener ID del primer resultado con dump-json + flat
            const searchOpts = { ...commonOpts, defaultSearch: 'ytsearch', dumpSingleJson: true, flatPlaylist: true }
            const searchResult = await youtubedl(query, searchOpts)

            let videoId = null
            if (searchResult.entries && searchResult.entries.length > 0) {
                videoId = searchResult.entries[0].id || searchResult.entries[0].url?.split('v=')[1]
                title = searchResult.entries[0].title || 'Primer resultado'
                duration = searchResult.entries[0].duration || 0
            } else if (searchResult.id) {
                videoId = searchResult.id
                title = searchResult.title || 'Resultado'
                duration = searchResult.duration || 0
            }

            if (!videoId) throw new Error('No se encontró video en búsqueda')

            // Construir URL real y tratar como link directo
            const constructedUrl = `https://www.youtube.com/watch?v=${videoId}`
            console.log('[music] URL construida de búsqueda:', constructedUrl)

            // Ahora extraer audio como si fuera link
            const infoOpts = { ...commonOpts, dumpSingleJson: true }
            const info = await youtubedl(constructedUrl, infoOpts)

            audioUrl = info.url || info.formats?.find(f => f.ext === 'm4a')?.url || info.formats?.[0]?.url
            title = info.title || title
            duration = info.duration || duration
        } else {
            console.log('[music] LINK directo')
            const info = await youtubedl(query, { ...commonOpts, dumpSingleJson: true })
            title = info.title || 'Sin título'
            duration = info.duration || 0

            audioUrl = info.url || info.formats?.find(f => f.ext === 'm4a')?.url || info.formats?.[0]?.url
        }

        if (!audioUrl) throw new Error('No URL audio válida')

        const min = Math.floor(duration / 60)
        const sec = duration % 60
        const durationStr = duration > 0 
            ? `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
            : '?'

        if (duration > MAX_DURATION_SEC && duration > 0) {
            await sock.sendMessage(jid, { text: `⛔ Muy largo (${durationStr})` })
            return
        }

        await sock.sendMessage(jid, {
            text: `🎵 ${title.slice(0, 50)}${title.length > 50 ? '...' : ''}\nDur: ${durationStr}\nDescargando...`
        })

        console.log('[music] URL final:', audioUrl.substring(0, 100) + '...')

        const res = await fetch(audioUrl, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } })
        if (!res.ok) throw new Error(`Fetch: ${res.status}`)

        tempInputFile = await tmp.file({ postfix: '.m4a' })
        const inputPath = tempInputFile.path

        const writeStream = fs.createWriteStream(inputPath)
        res.body.pipe(writeStream)

        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve)
            writeStream.on('error', reject)
        })

        console.log('[music] Descarga OK temp:', inputPath)

        tempOutputFile = await tmp.file({ postfix: '.ogg' })
        const outputPath = tempOutputFile.path

        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .inputFormat('m4a')
                .audioCodec('libopus')
                .audioBitrate(128)
                .format('ogg')
                .outputOptions(['-vn', '-map_metadata -1'])
                .on('start', cmd => console.log('[music] FFmpeg cmd:', cmd))
                .on('progress', p => console.log('[music] Progreso:', p.percent ? p.percent.toFixed(1) + '%' : 'N/A'))
                .on('error', (err, stdout, stderr) => {
                    console.error('[music] FFmpeg error:', err.message)
                    console.error('[music] stderr:', stderr)
                    reject(err)
                })
                .on('end', resolve)
                .save(outputPath)
        })

        console.log('[music] Conversión OK:', outputPath)

        const audioBuffer = await fs.promises.readFile(outputPath)

        if (audioBuffer.length > MAX_SIZE_MB_APROX * 1024 * 1024) {
            await sock.sendMessage(jid, { text: 'Pesado (>16MB)' })
            return
        }

        await sock.sendMessage(jid, {
            audio: audioBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
        })

        console.log(`[music] ENVIADO → ${title}`)

    } catch (err) {
        console.error('[music] ERROR FINAL:', err.message || err)
        await sock.sendMessage(jid, { text: '❌ Falló (prueba nombre más específico o link directo)' })
    } finally {
        if (tempInputFile) await tempInputFile.cleanup().catch(() => {})
        if (tempOutputFile) await tempOutputFile.cleanup().catch(() => {})
    }
}
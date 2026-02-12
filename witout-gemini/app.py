# app.py - Instagram Downloader com Conversão MP3 e Transcrição
# EDUCATIONAL PURPOSES ONLY

from flask import Flask, request, jsonify, send_file, Response
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import requests
import re
import json
from urllib.parse import quote, urlparse
import os
import uuid
import subprocess
import time
from threading import Thread
import tempfile
import yt_dlp

app = Flask(__name__)
CORS(app)

# Rate limiting
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["100 per 15 minutes"]
)

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB
TEMP_DIR = os.path.join(os.path.dirname(__file__), 'temp')
os.makedirs(TEMP_DIR, exist_ok=True)
COOKIES_DEFAULT_PATH = os.path.join(os.path.dirname(__file__), 'cookies.txt')

# Global storage for files (use Redis in production)
mp3_files = {}
transcriptions = {}

def parse_cookies_from_browser(value):
    """Parse cookies-from-browser value into yt-dlp tuple"""
    if not value or not isinstance(value, str):
        return None

    parts = [p.strip() for p in value.split(':', 1)]
    browser = parts[0]
    profile = parts[1].strip() if len(parts) > 1 and parts[1] else None

    if not browser:
        return None

    return (browser, profile) if profile else (browser,)

def build_ydl_opts():
    """Build yt-dlp options with optional cookies"""
    cookies_from_browser = (
        os.environ.get('INSTAGRAM_COOKIES_FROM_BROWSER')
        or os.environ.get('YTDLP_COOKIES_FROM_BROWSER')
    )
    cookies_file = (
        os.environ.get('INSTAGRAM_COOKIES_FILE')
        or os.environ.get('YTDLP_COOKIES_FILE')
    )
    if not cookies_file and os.path.exists(COOKIES_DEFAULT_PATH):
        cookies_file = COOKIES_DEFAULT_PATH

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'format': 'best',
    }

    if cookies_file:
        if os.path.exists(cookies_file):
            ydl_opts['cookiefile'] = cookies_file
            print(f'Usando arquivo de cookies: {cookies_file}')
        else:
            print(f'Aviso: arquivo de cookies não encontrado: {cookies_file}')

    if not ydl_opts.get('cookiefile') and cookies_from_browser:
        parsed = parse_cookies_from_browser(cookies_from_browser)
        if parsed:
            ydl_opts['cookiesfrombrowser'] = parsed

    return ydl_opts

def extract_shortcode(url):
    """Extract shortcode from Instagram URL"""
    patterns = [
        r'instagram\.com/p/([a-zA-Z0-9_-]+)',
        r'instagram\.com/reel/([a-zA-Z0-9_-]+)',
        r'instagram\.com/tv/([a-zA-Z0-9_-]+)',
        r'instagram\.com/share/reel/([a-zA-Z0-9_-]+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    
    return None

def validate_instagram_url(url):
    """Validate if URL is a valid Instagram URL"""
    if not url or not isinstance(url, str):
        return False
    
    valid_patterns = [
        r'^https?://(www\.)?instagram\.com/(p|reel|tv|share)/[a-zA-Z0-9_-]+',
        r'^https?://(www\.)?instagram\.com/stories/[a-zA-Z0-9._]+/[0-9]+'
    ]
    
    return any(re.match(pattern, url) for pattern in valid_patterns)

def download_file(url, filepath, headers=None):
    """Download file from URL with progress"""
    default_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.instagram.com/',
        'Origin': 'https://www.instagram.com'
    }
    
    if headers:
        default_headers.update(headers)
    
    response = requests.get(url, headers=default_headers, stream=True, timeout=60)
    response.raise_for_status()
    
    with open(filepath, 'wb') as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)

def get_file_size_mb(filepath):
    """Get file size in MB"""
    size_bytes = os.path.getsize(filepath)
    return round(size_bytes / (1024 * 1024), 2)

def get_video_duration(filepath):
    """Get video duration using ffprobe"""
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filepath
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode == 0:
            duration_seconds = float(result.stdout.strip())
            minutes = int(duration_seconds // 60)
            seconds = int(duration_seconds % 60)
            return f"{minutes}:{seconds:02d}", duration_seconds
        
        return "0:00", 0
    except Exception as e:
        print(f'Erro ao obter duração: {e}')
        return "0:00", 0

def convert_to_mp3(video_path, mp3_path, quality='192', title='Instagram Audio'):
    """Convert video to MP3 using ffmpeg"""
    try:
        cmd = [
            'ffmpeg',
            '-i', video_path,
            '-vn',  # Sem vídeo
            '-acodec', 'libmp3lame',
            '-ab', f'{quality}k',
            '-ar', '44100',
            '-metadata', f'title={title}',
            '-metadata', 'artist=Instagram',
            '-metadata', 'album=Instagram Downloads',
            '-y',  # Sobrescrever arquivo se existir
            mp3_path
        ]
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutos timeout
        )
        
        if result.returncode != 0:
            raise Exception(f'FFmpeg error: {result.stderr}')
        
        return True
    except Exception as e:
        raise Exception(f'Erro na conversão: {str(e)}')

def transcribe_audio(audio_path, language='pt'):
    """Transcrever áudio usando Whisper (OpenAI) ou alternativa"""
    try:
        # Tentar usar whisper se disponível
        try:
            import whisper
            model = whisper.load_model("base")
            result = model.transcribe(audio_path, language=language)
            return {
                'success': True,
                'text': result['text'],
                'language': result.get('language', language),
                'segments': result.get('segments', [])
            }
        except ImportError:
            # Fallback: usar ffmpeg para extrair e retornar mensagem
            return {
                'success': False,
                'error': 'Whisper não instalado. Instale com: pip install openai-whisper',
                'text': None
            }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'text': None
        }

def fetch_instagram_media(url):
    """Fetch Instagram media using yt-dlp (mais confiável)"""

    # Configuração do yt-dlp
    ydl_opts = build_ydl_opts()
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f'Extraindo informações do Instagram: {url}')
            info = ydl.extract_info(url, download=False)
            
            if not info:
                raise Exception('Não foi possível extrair informações do vídeo')
            
            media_urls = []
            is_video = info.get('_type') == 'video' or 'video' in info.get('ext', '')
            
            # Pegar o melhor formato de vídeo
            if 'formats' in info and info['formats']:
                # Filtrar apenas formatos de vídeo com áudio
                video_formats = [f for f in info['formats'] 
                               if f.get('vcodec') != 'none' and f.get('acodec') != 'none']
                
                if video_formats:
                    # Pegar o melhor formato
                    best_format = max(video_formats, key=lambda x: x.get('height', 0))
                    media_urls.append({
                        'type': 'video',
                        'url': best_format['url'],
                        'quality': f"{best_format.get('height', 'HD')}p",
                        'ext': best_format.get('ext', 'mp4')
                    })
                else:
                    # Fallback: usar URL direta
                    media_urls.append({
                        'type': 'video',
                        'url': info['url'],
                        'quality': 'HD',
                        'ext': info.get('ext', 'mp4')
                    })
            
            # Se tiver thumbnail, adicionar como foto
            thumbnail = info.get('thumbnail')
            if thumbnail:
                media_urls.append({
                    'type': 'photo',
                    'url': thumbnail,
                    'quality': 'thumbnail'
                })
            
            metadata = {
                'title': info.get('title', 'Instagram Media'),
                'author': info.get('uploader', 'Unknown'),
                'description': info.get('description', ''),
                'duration': info.get('duration')
            }
            
            return {
                'success': True,
                'method': 'yt-dlp',
                'media': media_urls,
                'metadata': metadata
            }
            
    except Exception as e:
        print(f'Erro com yt-dlp: {e}')
        
        # Fallback: tentar método alternativo com headers
        try:
            return fetch_instagram_media_fallback(url)
        except Exception as fallback_error:
            print(f'Erro no fallback: {fallback_error}')
            raise Exception(f'Não foi possível obter a mídia: {str(e)}')

def fetch_instagram_media_fallback(url):
    """Método fallback usando requests com headers avançados"""
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.instagram.com/',
        'Origin': 'https://www.instagram.com',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
    }
    
    try:
        session = requests.Session()
        
        # Primeiro, fazer uma requisição inicial para pegar cookies
        session.get('https://www.instagram.com/', headers=headers, timeout=10)
        
        # Agora fazer a requisição para o post
        response = session.get(url, headers=headers, timeout=15)
        
        if response.status_code != 200:
            raise Exception(f'Status code: {response.status_code}')
        
        html = response.text
        
        # Procurar por dados JSON na página
        media_urls = []
        
        # Padrões para extrair URLs
        patterns = [
            (r'"video_url":"([^"]+)"', 'video'),
            (r'"display_url":"([^"]+)"', 'photo'),
            (r'<meta property="og:video" content="([^"]+)"', 'video'),
            (r'<meta property="og:image" content="([^"]+)"', 'photo'),
        ]
        
        for pattern, media_type in patterns:
            matches = re.findall(pattern, html)
            for match in matches:
                clean_url = match.replace('\\u0026', '&').replace('\\', '')
                if clean_url and not any(m['url'] == clean_url for m in media_urls):
                    media_urls.append({
                        'type': media_type,
                        'url': clean_url,
                        'quality': 'HD'
                    })
        
        if not media_urls:
            raise Exception('Nenhuma mídia encontrada na página')
        
        # Extrair metadados
        title_match = re.search(r'<meta property="og:title" content="([^"]*)"', html)
        desc_match = re.search(r'<meta property="og:description" content="([^"]*)"', html)
        
        metadata = {
            'title': title_match.group(1) if title_match else 'Instagram Media',
            'author': 'Instagram',
            'description': desc_match.group(1) if desc_match else ''
        }
        
        return {
            'success': True,
            'method': 'fallback',
            'media': media_urls[:5],  # Limitar a 5 itens
            'metadata': metadata
        }
        
    except Exception as e:
        raise Exception(f'Fallback falhou: {str(e)}')

def cleanup_old_files():
    """Clean up files older than 1 hour"""
    try:
        current_time = time.time()
        one_hour = 60 * 60
        
        for filename in os.listdir(TEMP_DIR):
            filepath = os.path.join(TEMP_DIR, filename)
            if os.path.isfile(filepath):
                file_age = current_time - os.path.getmtime(filepath)
                if file_age > one_hour:
                    os.remove(filepath)
                    print(f'Arquivo removido: {filename}')
        
        # Clean up mp3_files dict
        to_delete = []
        for file_id, info in mp3_files.items():
            if current_time - info['created'] > one_hour:
                to_delete.append(file_id)
        
        for file_id in to_delete:
            del mp3_files[file_id]
            
    except Exception as e:
        print(f'Erro na limpeza: {e}')

@app.route('/api/download', methods=['POST'])
@limiter.limit("10 per minute")
def download_instagram():
    """Main endpoint for downloading Instagram media"""
    try:
        data = request.get_json()
        url = data.get('url')
        
        if not url:
            return jsonify({
                'error': 'URL é obrigatória',
                'success': False
            }), 400
        
        if not validate_instagram_url(url):
            return jsonify({
                'error': 'URL do Instagram inválida',
                'success': False
            }), 400
        
        # Fetch media
        result = fetch_instagram_media(url)
        return jsonify(result)
        
    except Exception as e:
        print(f'Erro no download: {str(e)}')
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@app.route('/api/convert-to-mp3', methods=['POST'])
@limiter.limit("5 per minute")
def convert_video_to_mp3():
    """Convert video to MP3"""
    video_path = None
    mp3_path = None
    
    try:
        data = request.get_json()
        video_url = data.get('video_url')
        quality = data.get('quality', '192')
        title = data.get('title', 'Instagram Audio')
        
        if not video_url:
            return jsonify({
                'error': 'URL do vídeo é obrigatória',
                'success': False
            }), 400
        
        # Validate quality
        valid_qualities = ['128', '192', '320']
        if quality not in valid_qualities:
            quality = '192'
        
        # Generate unique file IDs
        file_id = str(uuid.uuid4())
        video_path = os.path.join(TEMP_DIR, f'video_{file_id}.mp4')
        mp3_path = os.path.join(TEMP_DIR, f'audio_{file_id}.mp3')
        
        # Download video
        print(f'Baixando vídeo: {video_url}')
        download_file(video_url, video_path)
        
        # Check file size
        size_mb = get_file_size_mb(video_path)
        if size_mb > 300:
            raise Exception('Arquivo muito grande. Máximo: 300MB')
        
        # Convert to MP3
        print('Convertendo para MP3...')
        convert_to_mp3(video_path, mp3_path, quality, title)
        
        # Get file info
        mp3_size = get_file_size_mb(mp3_path)
        duration, duration_seconds = get_video_duration(video_path)
        
        # Store file info
        mp3_info = {
            'path': mp3_path,
            'filename': f'instagram_audio_{int(time.time())}.mp3',
            'size': mp3_size,
            'duration': duration,
            'duration_seconds': duration_seconds,
            'created': time.time()
        }
        
        mp3_files[file_id] = mp3_info
        
        # Remove video file
        if os.path.exists(video_path):
            os.remove(video_path)
        
        # Schedule cleanup (1 hour)
        def schedule_cleanup():
            time.sleep(3600)  # 1 hour
            try:
                if os.path.exists(mp3_path):
                    os.remove(mp3_path)
                if file_id in mp3_files:
                    del mp3_files[file_id]
            except Exception as e:
                print(f'Erro na limpeza agendada: {e}')
        
        Thread(target=schedule_cleanup, daemon=True).start()
        
        return jsonify({
            'success': True,
            'mp3_id': file_id,
            'download_url': f'/api/download-mp3/{file_id}',
            'transcribe_url': f'/api/transcribe/{file_id}',
            'filename': mp3_info['filename'],
            'size': f'{mp3_size} MB',
            'duration': duration,
            'quality': f'{quality} kbps'
        })
        
    except Exception as e:
        print(f'Erro na conversão: {str(e)}')
        
        # Cleanup on error
        for path in [video_path, mp3_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except:
                    pass
        
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@app.route('/api/download-mp3/<file_id>', methods=['GET'])
def download_mp3_file(file_id):
    """Download MP3 file"""
    try:
        if file_id not in mp3_files:
            return jsonify({
                'error': 'Arquivo não encontrado ou expirado',
                'success': False
            }), 404
        
        mp3_info = mp3_files[file_id]
        
        if not os.path.exists(mp3_info['path']):
            del mp3_files[file_id]
            return jsonify({
                'error': 'Arquivo não encontrado',
                'success': False
            }), 404
        
        return send_file(
            mp3_info['path'],
            as_attachment=True,
            download_name=mp3_info['filename'],
            mimetype='audio/mpeg'
        )
        
    except Exception as e:
        print(f'Erro no download do MP3: {str(e)}')
        return jsonify({
            'error': 'Erro ao baixar MP3',
            'success': False
        }), 500

@app.route('/api/transcribe/<file_id>', methods=['POST'])
@limiter.limit("5 per minute")
def transcribe_file(file_id):
    """Transcrever arquivo MP3 para texto"""
    try:
        if file_id not in mp3_files:
            return jsonify({
                'error': 'Arquivo não encontrado ou expirado',
                'success': False
            }), 404
        
        mp3_info = mp3_files[file_id]
        
        if not os.path.exists(mp3_info['path']):
            del mp3_files[file_id]
            return jsonify({
                'error': 'Arquivo não encontrado',
                'success': False
            }), 404
        
        # Verificar se já existe transcrição
        if file_id in transcriptions:
            return jsonify({
                'success': True,
                'transcription': transcriptions[file_id]
            })
        
        # Obter idioma do request
        data = request.get_json() or {}
        language = data.get('language', 'pt')
        
        # Transcrever
        result = transcribe_audio(mp3_info['path'], language)
        
        if result['success']:
            transcriptions[file_id] = result
        
        return jsonify(result)
        
    except Exception as e:
        print(f'Erro na transcrição: {str(e)}')
        return jsonify({
            'error': str(e),
            'success': False
        }), 500

@app.route('/api/proxy', methods=['GET'])
@limiter.limit("20 per minute")
def proxy_download():
    """Proxy endpoint to download files"""
    try:
        url = request.args.get('url')
        filename = request.args.get('filename', 'download')
        
        if not url:
            return jsonify({'error': 'URL é obrigatória'}), 400
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
            'Referer': 'https://www.instagram.com/'
        }
        
        response = requests.get(url, headers=headers, stream=True, timeout=60)
        response.raise_for_status()
        
        def generate():
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        
        content_type = response.headers.get('Content-Type', 'application/octet-stream')
        
        return Response(
            generate(),
            content_type=content_type,
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Length': response.headers.get('Content-Length', '')
            }
        )
        
    except Exception as e:
        print(f'Erro no proxy: {str(e)}')
        return jsonify({'error': 'Falha no proxy do arquivo'}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    # Check if ffmpeg is available
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
        ffmpeg_status = 'disponível'
    except:
        ffmpeg_status = 'não disponível'
    
    # Check whisper
    try:
        import whisper
        whisper_status = 'disponível'
    except ImportError:
        whisper_status = 'não instalado (pip install openai-whisper)'
    
    # Check yt-dlp
    try:
        import yt_dlp
        ytdlp_status = 'disponível'
    except ImportError:
        ytdlp_status = 'não instalado (pip install yt-dlp)'

    cookies_file = (
        os.environ.get('INSTAGRAM_COOKIES_FILE')
        or os.environ.get('YTDLP_COOKIES_FILE')
    )
    if not cookies_file and os.path.exists(COOKIES_DEFAULT_PATH):
        cookies_file = COOKIES_DEFAULT_PATH
    cookies_from_browser = (
        os.environ.get('INSTAGRAM_COOKIES_FROM_BROWSER')
        or os.environ.get('YTDLP_COOKIES_FROM_BROWSER')
    )
    cookies_file_exists = bool(cookies_file and os.path.exists(cookies_file))
    
    return jsonify({
        'status': 'ok',
        'timestamp': time.time(),
        'version': '2.1.0',
        'ffmpeg': ffmpeg_status,
        'whisper': whisper_status,
        'yt-dlp': ytdlp_status,
        'cookies_file': cookies_file if cookies_file else None,
        'cookies_file_exists': cookies_file_exists,
        'cookies_from_browser': cookies_from_browser if cookies_from_browser else None,
        'temp_files': len(os.listdir(TEMP_DIR)),
        'stored_mp3s': len(mp3_files)
    })

@app.route('/api/cookies', methods=['POST'])
@limiter.limit("5 per minute")
def update_cookies_file():
    """Update cookies.txt content (Netscape format)"""
    try:
        data = request.get_json() or {}
        content = data.get('content')

        if not content or not isinstance(content, str):
            return jsonify({
                'success': False,
                'error': 'Conteúdo de cookies é obrigatório'
            }), 400

        normalized = content.replace('\r\n', '\n').replace('\r', '\n').strip()

        if not normalized.startswith('# Netscape HTTP Cookie File'):
            return jsonify({
                'success': False,
                'error': 'Formato inválido. Cole o conteúdo no formato Netscape.'
            }), 400

        if not normalized.endswith('\n'):
            normalized += '\n'

        # Backup existing cookies
        if os.path.exists(COOKIES_DEFAULT_PATH):
            backup_path = f"{COOKIES_DEFAULT_PATH}.bak"
            try:
                os.replace(COOKIES_DEFAULT_PATH, backup_path)
            except Exception:
                pass

        tmp_path = f"{COOKIES_DEFAULT_PATH}.tmp"
        with open(tmp_path, 'w', encoding='utf-8') as f:
            f.write(normalized)
        os.replace(tmp_path, COOKIES_DEFAULT_PATH)

        return jsonify({
            'success': True,
            'message': 'cookies.txt atualizado com sucesso',
            'path': COOKIES_DEFAULT_PATH
        })

    except Exception as e:
        print(f'Erro ao atualizar cookies: {e}')
        return jsonify({
            'success': False,
            'error': 'Falha ao atualizar cookies'
        }), 500

@app.route('/')
def index():
    """Serve frontend"""
    return send_file('index.html')

@app.errorhandler(429)
def ratelimit_handler(e):
    """Handle rate limit exceeded"""
    return jsonify({
        'error': 'Limite de requisições excedido. Tente novamente mais tarde.',
        'success': False
    }), 429

@app.errorhandler(500)
def error_handler(e):
    """Handle internal errors"""
    return jsonify({
        'error': 'Erro interno do servidor',
        'success': False
    }), 500

# Periodic cleanup thread
def periodic_cleanup():
    """Run cleanup every 30 minutes"""
    while True:
        time.sleep(1800)  # 30 minutes
        print('Executando limpeza periódica...')
        cleanup_old_files()

# Start cleanup thread
cleanup_thread = Thread(target=periodic_cleanup, daemon=True)
cleanup_thread.start()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    print('🚀 Instagram Downloader + MP3 + Transcrição API iniciando...')
    print(f'📱 Servidor: http://localhost:{port}')
    print(f'🔌 API: http://localhost:{port}/api/download')
    print(f'🎵 Conversão MP3: http://localhost:{port}/api/convert-to-mp3')
    print(f'📝 Transcrição: http://localhost:{port}/api/transcribe/<file_id>')
    print('\n⚠️  IMPORTANTE: Apenas para fins educacionais.')
    print('   Baixar conteúdo pode violar os Termos de Serviço do Instagram.\n')
    
    # Check FFmpeg
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, timeout=5)
        print('✅ FFmpeg encontrado!')
    except:
        print('❌ FFmpeg não encontrado! Instale para usar conversão MP3.')
    
    # Check yt-dlp
    try:
        import yt_dlp
        print('✅ yt-dlp encontrado!')
    except ImportError:
        print('❌ yt-dlp não encontrado! Execute: pip install yt-dlp')
    
    # Check Whisper
    try:
        import whisper
        print('✅ Whisper encontrado!')
    except ImportError:
        print('⚠️  Whisper não instalado. Instale com: pip install openai-whisper')
    
    print('')
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug
    )

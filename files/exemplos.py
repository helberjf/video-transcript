#!/usr/bin/env python3
"""
Exemplos de uso da API de Transcrição
"""

import requests
import json
import time
import os

# URL base da API
BASE_URL = "http://localhost:5000"

def exemplo_1_upload_e_transcricao_gemini():
    """Exemplo 1: Upload de arquivo e transcrição com Gemini"""
    print("\n" + "="*60)
    print("EXEMPLO 1: Upload e Transcrição com Gemini")
    print("="*60)
    
    # Caminho do arquivo (substitua pelo seu arquivo)
    arquivo_path = "meu_audio.mp3"
    
    if not os.path.exists(arquivo_path):
        print(f"❌ Arquivo '{arquivo_path}' não encontrado!")
        print("   Altere a variável 'arquivo_path' com o caminho do seu arquivo.")
        return
    
    # 1. Upload do arquivo
    print("\n📤 Fazendo upload do arquivo...")
    with open(arquivo_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(f"{BASE_URL}/api/upload-file", files=files)
    
    if not response.ok:
        print(f"❌ Erro no upload: {response.json()}")
        return
    
    result = response.json()
    file_id = result['file_id']
    print(f"✅ Upload concluído! File ID: {file_id}")
    print(f"   Tamanho: {result['size']}")
    print(f"   Duração: {result['duration']}")
    
    # 2. Transcrição com Gemini
    print("\n🎤 Transcrevendo com Gemini...")
    data = {
        'method': 'gemini',
        'prompt': 'Transcreva este áudio em português com pontuação adequada.'
    }
    response = requests.post(f"{BASE_URL}/api/transcribe/{file_id}", json=data)
    
    if not response.ok:
        print(f"❌ Erro na transcrição: {response.json()}")
        return
    
    result = response.json()
    
    if result['success']:
        print("✅ Transcrição concluída!")
        print(f"   Método: {result['method']}")
        print(f"\n📝 Texto transcrito:\n")
        print("-" * 60)
        print(result['text'])
        print("-" * 60)
    else:
        print(f"❌ Erro: {result['error']}")


def exemplo_2_instagram_para_transcricao():
    """Exemplo 2: Download do Instagram e transcrição"""
    print("\n" + "="*60)
    print("EXEMPLO 2: Instagram → MP3 → Transcrição")
    print("="*60)
    
    # URL do Instagram (substitua pela URL desejada)
    instagram_url = "https://www.instagram.com/reel/ABC123/"
    
    print(f"\n📱 URL do Instagram: {instagram_url}")
    
    # 1. Download do Instagram
    print("\n⬇️  Baixando mídia do Instagram...")
    data = {'url': instagram_url}
    response = requests.post(f"{BASE_URL}/api/download", json=data)
    
    if not response.ok:
        print(f"❌ Erro no download: {response.json()}")
        return
    
    result = response.json()
    
    if not result['success']:
        print(f"❌ Erro: {result.get('error', 'Desconhecido')}")
        return
    
    # Pegar URL do vídeo
    video_url = None
    for media in result['media']:
        if media['type'] == 'video':
            video_url = media['url']
            break
    
    if not video_url:
        print("❌ Nenhum vídeo encontrado neste post")
        return
    
    print(f"✅ Vídeo encontrado!")
    
    # 2. Converter para MP3
    print("\n🎵 Convertendo para MP3...")
    data = {
        'video_url': video_url,
        'quality': '192',
        'title': result['metadata']['title']
    }
    response = requests.post(f"{BASE_URL}/api/convert-to-mp3", json=data)
    
    if not response.ok:
        print(f"❌ Erro na conversão: {response.json()}")
        return
    
    result = response.json()
    file_id = result['mp3_id']
    print(f"✅ Conversão concluída!")
    print(f"   Tamanho: {result['size']}")
    print(f"   Duração: {result['duration']}")
    
    # 3. Transcrever (método automático: tenta Gemini, depois Whisper)
    print("\n🎤 Transcrevendo...")
    data = {'method': 'auto'}
    response = requests.post(f"{BASE_URL}/api/transcribe/{file_id}", json=data)
    
    if not response.ok:
        print(f"❌ Erro na transcrição: {response.json()}")
        return
    
    result = response.json()
    
    if result['success']:
        print("✅ Transcrição concluída!")
        print(f"   Método usado: {result['method']}")
        print(f"\n📝 Texto transcrito:\n")
        print("-" * 60)
        print(result['text'])
        print("-" * 60)
    else:
        print(f"❌ Erro: {result['error']}")


def exemplo_3_transcricao_direta():
    """Exemplo 3: Transcrição direta (sem salvar arquivo)"""
    print("\n" + "="*60)
    print("EXEMPLO 3: Transcrição Direta (Rápida)")
    print("="*60)
    
    arquivo_path = "meu_audio.mp3"
    
    if not os.path.exists(arquivo_path):
        print(f"❌ Arquivo '{arquivo_path}' não encontrado!")
        return
    
    print(f"\n📤 Transcrevendo arquivo: {arquivo_path}")
    
    with open(arquivo_path, 'rb') as f:
        files = {'file': f}
        data = {
            'method': 'gemini',
            'prompt': 'Faça um resumo detalhado deste áudio'
        }
        response = requests.post(
            f"{BASE_URL}/api/transcribe-direct",
            files=files,
            data=data
        )
    
    if not response.ok:
        print(f"❌ Erro: {response.json()}")
        return
    
    result = response.json()
    
    if result['success']:
        print("✅ Transcrição concluída!")
        print(f"   Método: {result['method']}")
        print(f"\n📝 Resumo:\n")
        print("-" * 60)
        print(result['text'])
        print("-" * 60)
    else:
        print(f"❌ Erro: {result['error']}")


def exemplo_4_prompt_customizado():
    """Exemplo 4: Usando prompts customizados com Gemini"""
    print("\n" + "="*60)
    print("EXEMPLO 4: Prompts Customizados")
    print("="*60)
    
    arquivo_path = "meu_audio.mp3"
    
    if not os.path.exists(arquivo_path):
        print(f"❌ Arquivo '{arquivo_path}' não encontrado!")
        return
    
    prompts = [
        "Transcreva este áudio e identifique os principais tópicos discutidos.",
        "Faça um resumo executivo deste áudio em bullet points.",
        "Transcreva e identifique quantos falantes diferentes há neste áudio.",
    ]
    
    # Upload do arquivo
    print("\n📤 Fazendo upload...")
    with open(arquivo_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(f"{BASE_URL}/api/upload-file", files=files)
    
    if not response.ok:
        print(f"❌ Erro: {response.json()}")
        return
    
    file_id = response.json()['file_id']
    print(f"✅ Upload concluído! File ID: {file_id}")
    
    # Testar diferentes prompts
    for i, prompt in enumerate(prompts, 1):
        print(f"\n{'='*60}")
        print(f"Teste {i}: {prompt}")
        print('='*60)
        
        data = {
            'method': 'gemini',
            'prompt': prompt
        }
        response = requests.post(f"{BASE_URL}/api/transcribe/{file_id}", json=data)
        
        if response.ok:
            result = response.json()
            if result['success']:
                print(f"\n📝 Resultado:\n")
                print("-" * 60)
                print(result['text'])
                print("-" * 60)
            else:
                print(f"❌ Erro: {result['error']}")
        
        # Pequena pausa entre requisições
        if i < len(prompts):
            time.sleep(2)


def verificar_status():
    """Verifica o status da API"""
    print("\n" + "="*60)
    print("STATUS DO SISTEMA")
    print("="*60)
    
    response = requests.get(f"{BASE_URL}/api/health")
    
    if not response.ok:
        print("❌ Erro ao verificar status")
        return
    
    result = response.json()
    
    print(f"\n✅ Status: {result['status']}")
    print(f"📦 Versão: {result['version']}")
    print(f"\n🔧 Dependências:")
    print(f"   • FFmpeg: {result['ffmpeg']}")
    print(f"   • Whisper: {result['whisper']}")
    print(f"   • yt-dlp: {result['yt-dlp']}")
    print(f"   • Gemini: {result['gemini']['status']}")
    print(f"     API Key: {result['gemini']['api_key']}")
    print(f"\n📊 Sistema:")
    print(f"   • Arquivos temporários: {result['temp_files']}")
    print(f"   • MP3s armazenados: {result['stored_mp3s']}")


def menu():
    """Menu interativo"""
    print("\n" + "="*60)
    print("EXEMPLOS DE USO DA API DE TRANSCRIÇÃO")
    print("="*60)
    print("\n1. Upload de arquivo e transcrição com Gemini")
    print("2. Instagram → MP3 → Transcrição")
    print("3. Transcrição direta (rápida)")
    print("4. Prompts customizados")
    print("5. Verificar status do sistema")
    print("0. Sair")
    
    opcao = input("\nEscolha uma opção: ").strip()
    
    if opcao == "1":
        exemplo_1_upload_e_transcricao_gemini()
    elif opcao == "2":
        exemplo_2_instagram_para_transcricao()
    elif opcao == "3":
        exemplo_3_transcricao_direta()
    elif opcao == "4":
        exemplo_4_prompt_customizado()
    elif opcao == "5":
        verificar_status()
    elif opcao == "0":
        print("\n👋 Até logo!")
        return False
    else:
        print("\n❌ Opção inválida!")
    
    return True


if __name__ == "__main__":
    print("""
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║    API de Transcrição - Whisper & Gemini                  ║
║    Exemplos de Uso                                        ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    """)
    
    # Verificar se a API está rodando
    try:
        response = requests.get(f"{BASE_URL}/api/health", timeout=2)
        if response.ok:
            print("✅ API está rodando!")
        else:
            print("⚠️  API respondeu mas com erro")
    except:
        print("❌ API não está rodando!")
        print("   Execute: python app.py")
        exit(1)
    
    # Menu interativo
    continuar = True
    while continuar:
        continuar = menu()
        
        if continuar:
            input("\n\nPressione ENTER para continuar...")

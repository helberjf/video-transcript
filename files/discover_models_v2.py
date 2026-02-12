#!/usr/bin/env python3
"""
Script atualizado para descobrir modelos Gemini disponíveis
"""

import os
from dotenv import load_dotenv

load_dotenv()

print("="*70)
print("DESCOBRINDO MODELOS GEMINI DISPONÍVEIS (v2)")
print("="*70)

api_key = os.environ.get('GEMINI_API_KEY')

if not api_key:
    print("\n❌ GEMINI_API_KEY não encontrada!")
    exit(1)

print(f"\n✅ API Key: {api_key[:15]}...{api_key[-5:]}")

try:
    from google import genai
    print("✅ Biblioteca google-genai importada")
    
    client = genai.Client(api_key=api_key)
    print("✅ Cliente criado\n")
    
    print("="*70)
    print("LISTANDO TODOS OS MODELOS:")
    print("="*70)
    
    models_list = list(client.models.list())
    
    print(f"\n📊 Total de modelos encontrados: {len(models_list)}\n")
    
    # Listar todos os modelos e seus atributos
    print("📋 Todos os modelos disponíveis:")
    print("-"*70)
    
    gemini_models = []
    
    for i, model in enumerate(models_list, 1):
        name = model.name
        
        # Verificar se é um modelo Gemini
        if 'gemini' in name.lower():
            print(f"\n{i}. ✅ {name}")
            gemini_models.append(name)
            
            # Tentar pegar outros atributos
            try:
                if hasattr(model, 'display_name'):
                    print(f"   Nome: {model.display_name}")
            except:
                pass
            
            try:
                if hasattr(model, 'description'):
                    print(f"   Descrição: {model.description[:80]}...")
            except:
                pass
                
            # Listar todos os atributos disponíveis
            attrs = [attr for attr in dir(model) if not attr.startswith('_')]
            print(f"   Atributos: {', '.join(attrs[:5])}...")
    
    if not gemini_models:
        print("\n❌ Nenhum modelo Gemini encontrado!")
        print("\n📋 Modelos disponíveis:")
        for model in models_list[:10]:
            print(f"   • {model.name}")
        exit(1)
    
    print("\n" + "="*70)
    print("TESTANDO MODELOS GEMINI:")
    print("="*70)
    
    # Testar cada modelo Gemini
    working_models = []
    
    for model_name in gemini_models:
        print(f"\n🧪 Testando: {model_name}")
        
        # Tentar com o nome completo
        try:
            response = client.models.generate_content(
                model=model_name,
                contents='Responda apenas "OK"'
            )
            
            print(f"   ✅ FUNCIONOU! Resposta: {response.text.strip()}")
            working_models.append(model_name)
            
        except Exception as e:
            error_str = str(e)
            if '404' in error_str or 'not found' in error_str.lower():
                print(f"   ❌ Não encontrado (404)")
                
                # Tentar sem o prefixo "models/"
                if model_name.startswith('models/'):
                    short_name = model_name.replace('models/', '')
                    print(f"   🔄 Tentando sem prefixo: {short_name}")
                    
                    try:
                        response = client.models.generate_content(
                            model=short_name,
                            contents='Responda apenas "OK"'
                        )
                        
                        print(f"   ✅ FUNCIONOU! Resposta: {response.text.strip()}")
                        working_models.append(short_name)
                    except Exception as e2:
                        print(f"   ❌ Também falhou: {str(e2)[:60]}...")
                else:
                    # Tentar com o prefixo "models/"
                    full_name = f"models/{model_name}"
                    print(f"   🔄 Tentando com prefixo: {full_name}")
                    
                    try:
                        response = client.models.generate_content(
                            model=full_name,
                            contents='Responda apenas "OK"'
                        )
                        
                        print(f"   ✅ FUNCIONOU! Resposta: {response.text.strip()}")
                        working_models.append(full_name)
                    except Exception as e2:
                        print(f"   ❌ Também falhou: {str(e2)[:60]}...")
            else:
                print(f"   ❌ Erro: {error_str[:80]}...")
    
    print("\n" + "="*70)
    print("RESUMO:")
    print("="*70)
    
    if working_models:
        print(f"\n✅ {len(working_models)} modelo(s) funcionando:\n")
        for model in working_models:
            print(f"   • {model}")
        
        print("\n" + "="*70)
        print("🎯 COLE ISTO NO SEU app.py:")
        print("="*70)
        
        print(f"""
# Na função transcribe_audio_gemini(), substitua a linha:

response = client.models.generate_content(
    model="{working_models[0]}",  # ← USE ESTE MODELO
    contents=[prompt, arquivo]
)
""")
        
        if len(working_models) > 1:
            print(f"\n💡 Modelos alternativos para testar:")
            for alt_model in working_models[1:]:
                print(f"   • {alt_model}")
                
    else:
        print("\n❌ NENHUM MODELO FUNCIONOU!")
        print("\nPossíveis causas:")
        print("1. API key sem permissão para usar Gemini")
        print("2. Região/país sem acesso ao Gemini")
        print("3. Problema com a biblioteca google-genai")
        print("\nSoluções:")
        print("• Crie uma NOVA API key em: https://aistudio.google.com/")
        print("• Tente atualizar a biblioteca: pip install -U google-genai")
        print("• Use Whisper como alternativa (funciona offline)")
    
except ImportError:
    print("❌ Biblioteca google-genai não instalada!")
    print("   Execute: pip install -U google-genai")
    exit(1)
except Exception as e:
    print(f"\n❌ ERRO GERAL: {str(e)}")
    import traceback
    traceback.print_exc()
    exit(1)
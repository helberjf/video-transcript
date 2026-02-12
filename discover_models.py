#!/usr/bin/env python3
"""
Script para descobrir os modelos Gemini disponíveis na sua API key
"""

import os
from dotenv import load_dotenv

load_dotenv()

print("="*70)
print("DESCOBRINDO MODELOS GEMINI DISPONÍVEIS")
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
    
    if not models_list:
        print("❌ Nenhum modelo encontrado!")
        print("\nPossíveis causas:")
        print("1. API key inválida")
        print("2. Problema de permissões")
        print("3. Versão incorreta da biblioteca")
        exit(1)
    
    print(f"\n📊 Total de modelos encontrados: {len(models_list)}\n")
    
    # Modelos que suportam generateContent
    gemini_models = []
    
    for model in models_list:
        name = model.name
        methods = model.supported_generation_methods
        
        # Verificar se suporta generateContent
        if 'generateContent' in methods:
            gemini_models.append(name)
            print(f"✅ {name}")
            print(f"   Métodos: {', '.join(methods)}")
            print()
    
    if not gemini_models:
        print("\n❌ Nenhum modelo com suporte a generateContent encontrado!")
        exit(1)
    
    print("="*70)
    print("TESTANDO O PRIMEIRO MODELO:")
    print("="*70)
    
    test_model = gemini_models[0]
    print(f"\n🧪 Testando: {test_model}")
    
    try:
        response = client.models.generate_content(
            model=test_model,
            contents='Responda apenas "OK" se você está funcionando.'
        )
        
        print(f"✅ SUCESSO! Resposta: {response.text}")
        print(f"\n🎯 USE ESTE MODELO NO SEU CÓDIGO:")
        print(f"   model='{test_model}'")
        
    except Exception as e:
        print(f"❌ Erro ao testar: {e}")
        
        # Tentar sem o prefixo "models/"
        test_model_short = test_model.replace('models/', '')
        print(f"\n🧪 Tentando sem prefixo: {test_model_short}")
        
        try:
            response = client.models.generate_content(
                model=test_model_short,
                contents='Responda apenas "OK" se você está funcionando.'
            )
            
            print(f"✅ SUCESSO! Resposta: {response.text}")
            print(f"\n🎯 USE ESTE MODELO NO SEU CÓDIGO:")
            print(f"   model='{test_model_short}'")
            
        except Exception as e2:
            print(f"❌ Também falhou: {e2}")
    
    print("\n" + "="*70)
    print("RESUMO - Cole isto no seu app.py:")
    print("="*70)
    print(f"""
# Substitua a linha do modelo por:
response = client.models.generate_content(
    model='{gemini_models[0]}',  # ou tente sem 'models/': '{gemini_models[0].replace('models/', '')}'
    contents=[prompt, arquivo]
)
""")
    
except ImportError:
    print("❌ Biblioteca google-genai não instalada!")
    print("   Execute: pip install -U google-genai")
    exit(1)
except Exception as e:
    print(f"\n❌ ERRO: {str(e)}")
    print("\nDetalhes do erro:")
    import traceback
    traceback.print_exc()
    exit(1)
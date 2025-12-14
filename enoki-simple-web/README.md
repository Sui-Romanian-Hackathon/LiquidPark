# Enoki zkLogin - Simple Web App

Cea mai simplă aplicație web care folosește Enoki zkLogin pentru a te conecta la Sui prin Google.

## Setup

1. **Instalează dependențele:**
```bash
npm install
```

2. **Configurează Enoki:**
   - Obține un API key de la [Enoki Developer Portal](https://developer.enoki.mystenlabs.com)
   - Creează un Google OAuth Client ID în [Google Cloud Console](https://console.cloud.google.com)
   - **IMPORTANT:** Configurează redirect URI în Google Cloud Console:
     - Mergi la **APIs & Services** → **Credentials**
     - Click pe OAuth 2.0 Client ID-ul tău
     - În **Authorized redirect URIs**, adaugă: `http://localhost:3000`
     - Salvează modificările

3. **Actualizează configurația:**
   Deschide `src/config/enoki.ts` și adaugă:
   - `apiKey`: API key-ul tău Enoki
   - `clientId`: Google OAuth Client ID-ul tău

4. **Rulează aplicația:**
```bash
npm run dev
```

Aplicația va porni la `http://localhost:3000`

## Cum funcționează

1. Click pe butonul "Connect with Google"
2. Autentifică-te cu Google
3. Odată conectat, vei vedea adresa ta Sui generată prin zkLogin

## Structură

- `src/App.tsx` - Componenta principală cu butonul de conectare
- `src/config/enoki.ts` - Configurația Enoki (API key, Google Client ID)
- `src/services/enokiApi.ts` - Serviciu pentru apelarea API-ului Enoki

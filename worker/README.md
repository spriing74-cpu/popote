# Service IA personnel de Popote (Cloudflare Worker)

Ce petit serveur permet à Popote :
- de **reconnaître un appareil sur photo** (type, marque, référence) ;
- de **chercher la notice du modèle sur le web** et d'en tirer les réglages recommandés (modes, températures, durées), avec les sources.

Il utilise Claude (Anthropic). **Votre clé API reste dans le Worker** : elle n'est jamais dans l'application ni sur GitHub.

## Ce qu'il faut (≈ 15 minutes)

1. Un compte **Anthropic** (console.anthropic.com) avec une clé API et un moyen de paiement.
   **Réglez tout de suite une limite de dépense mensuelle** (Console › Settings › Limits), par exemple 5 €.
2. Un compte **Cloudflare** gratuit (dash.cloudflare.com). Le forfait gratuit suffit largement.
3. Node.js installé (déjà le cas pour le projet).

## Installation

Dans un terminal, depuis le dossier `worker` du projet :

```bash
npm install
```

```bash
npx wrangler login
```

(ouvre le navigateur pour vous connecter à Cloudflare)

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

(collez votre clé quand elle est demandée : elle est chiffrée chez Cloudflare)

```bash
npx wrangler deploy
```

La commande affiche l'adresse du service, du type `https://popote-ia.<votre-compte>.workers.dev`.
Dans Popote : **Réglages › Ma cuisine › Service IA personnel**, collez cette adresse et enregistrez.

Vérification : ouvrez `https://popote-ia.<votre-compte>.workers.dev/health` dans le navigateur, vous devez lire `{"ok":true,...}`.

## Coût

Facturé par Anthropic sur votre compte, à l'usage (modèle Claude Opus 5 : 5 $ par million de jetons en entrée, 25 $ en sortie ; la recherche web est facturée en plus, par recherche — voir la page officielle des tarifs).
Ordres de grandeur :
- reconnaissance d'une photo : environ 1 à 3 centimes ;
- recherche des réglages d'un appareil : quelques dizaines de centimes (plusieurs recherches web et pages lues).

La recherche se fait **une fois par appareil** : le résultat est gardé dans Popote.

## Sécurité

- Le service n'accepte que les appels venant de l'application (origine `https://spriing74-cpu.github.io`, réglable dans `wrangler.toml`). Un programme malveillant peut imiter cette origine : **la limite de dépense Anthropic est votre vraie protection**.
- Pour couper l'IA : supprimez le Worker (`npx wrangler delete`) ou révoquez la clé dans la console Anthropic.

## Fiabilité

Les réglages trouvés viennent de pages web (notices, fiches produits) et sont mis en forme par l'IA : ils peuvent être incomplets ou faux. Popote les affiche comme « IA, à vérifier » avec leurs sources, et ne garde que des sources réellement consultées. **La notice papier de votre appareil fait foi.**

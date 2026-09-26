# Popote — repas & courses pour deux

PWA en français pour planifier les repas du **samedi au mercredi** (midi et soir, 10 créneaux), à deux profils (« Moi » et « Ma compagne »), avec une préparation groupée le week-end et une **liste de courses calculée** depuis le planning réel. Elle fonctionne hors ligne, sans compte ni clé d'API, et s'héberge gratuitement sur GitHub Pages.

## Démarrer

```bash
npm install
npm test            # 50 tests : portions, absents, agrégation, unités, restes, conservation, import/export, tickets, dates, codes-barres, stock, vide-frigo
npm run dev         # http://localhost:5173 (sans service worker)
npm run build       # contrôle des types + build de production dans dist/
npm run preview     # http://localhost:4173 (avec service worker, pour tester le hors-ligne)
npm run icons       # régénère les icônes PNG (déjà fournies dans public/icons)
npm run scan-assets # copie les moteurs de scan dans public/scan (automatique avant dev/build)
```

Pour tester sur l'iPhone depuis le PC : `npx vite preview --host`, puis ouvrir `http://<IP-du-PC>:4173` dans Safari. Le service worker ne fonctionne qu'en HTTPS ou sur localhost : **le test hors ligne complet se fait donc sur GitHub Pages.**

## Déployer sur GitHub Pages

1. Créer un dépôt GitHub (par exemple `popote`) et y pousser le projet sur la branche `main` :
   ```bash
   git init && git add -A && git commit -m "Popote MVP"
   git branch -M main
   git remote add origin https://github.com/<utilisateur>/popote.git
   git push -u origin main
   ```
2. Sur GitHub : **Settings › Pages › Build and deployment › Source : GitHub Actions**.
3. Le workflow `.github/workflows/deploy.yml` lance les tests, compile avec `BASE_PATH=/<nom-du-depot>/`, puis publie. L'adresse est `https://<utilisateur>.github.io/<nom-du-depot>/`.

## Architecture

```
src/
  domain/                ← logique pure, testée, sans React
    types.ts             modèle de données
    units.ts             conversions (g/kg, ml/cl/l/c.à c./c.à s., pièces↔g), formatage, arrondi d'achat
    week.ts              créneaux sam→mer, jours de préparation, restes
    portions.ts          consommation par personne et par repas (facteurs du profil, portion ponctuelle, accompagnement, compléments), plan de cuisson
    shopping.ts          agrégation, placard, conditionnements, articles manuels, rayons
    freshness.ts         contrôle de conservation (batch cooking) : ok / congeler / assembler la veille / trop long
    planner.ts           suggestions variées et déterministes (graine), contraintes de boîte froide
    budget.ts            budget à partir des SEULS prix saisis, comparaison magasins
    inventory.ts         stock : quantités utilisables, urgence, dates estimées, consommation FIFO
    matching.ts          libellé (ticket, fiche produit) → ingrédient, abréviations, libellés appris
    receipt.ts           analyse d'un ticket OCR (articles, pesées, quantités) et des dates DLC/DDM
    openfoodfacts.ts     recherche par code-barres (Open Food Facts), quantité, rattachement
    antigaspi.ts         classement du catalogue et recettes vide-frigo générées hors ligne
    __tests__/           tests Vitest
  data/                  ← contenu
    ingredients.ts       ~110 ingrédients normalisés (id, rayon, unité, poids unitaire, conditionnement, allergènes)
    recipes.ts           39 recettes structurées
    sides.ts             accompagnements et compléments (fruit, yaourt, collation…)
    foodinfo.ts          famille, rangement, durée de conservation estimée, mots-clés de ticket
    aisles.ts, catalog.ts, defaults.ts (valeurs supposées, modifiables)
  state/                 ← état de l'application
    reducer.ts           actions (choix de recette, restes, convives, placard, prix…)
    persistence.ts       localStorage, export/import JSON, réparation des données
    store.tsx            contexte React + sauvegarde automatique
  scan/                  ← accès caméra/photo : codes-barres (ZXing WebAssembly), OCR (Tesseract, français)
  ui/                    ← écrans React (dont FridgeScreen, BarcodeScanner, ReceiptScanner, ItemForm)
    PlanningScreen.tsx, SlotEditor.tsx, RecipesScreen.tsx, RecipeDetail.tsx, ShoppingScreen.tsx, SettingsScreen.tsx, common.tsx
```

Les dépendances vont de l'interface vers le domaine, jamais l'inverse. La liste de courses ne lit **jamais de texte libre** : elle additionne des lignes `{ingredientId, qty, unit, role}`.

### Écrans

- **Planning** : 5 jours × midi/soir. « Compléter les cases vides », « Tout reproposer » ou « Nouvelle semaine ». Un appui sur un repas ouvre l'éditeur : recette ou restes d'un repas antérieur ; présence, portion (×0,5 à ×2), accompagnement et compléments de chaque personne ; jour de préparation ; portions en plus ; réservation de restes pour des repas ultérieurs. L'onglet **Préparation (batch)** liste, par session, les quantités totales à cuisiner et les alertes de conservation.
- **Frigo** : stock trié par urgence (date dépassée, 2 jours, semaine, plus tard). Trois façons d'ajouter : **codes-barres** en série (caméra en direct en HTTPS, sinon photo ou saisie des chiffres), **ticket de caisse** (photo(s), lecture sur l'appareil, validation ligne par ligne, abréviations apprises), **à la main**. Pour chaque produit, la date limite peut être **lue sur l'emballage** (photo) ou estimée. L'onglet **Idées anti-gaspi** propose des recettes vide-frigo générées hors ligne (omelette, poêlée, gratin, soupe, quiche, salade, pâtes) avec ce qui périme en premier, et les recettes du catalogue qui utilisent le stock. Une idée « gardée » se planifie comme une recette normale.
- **Recettes** : recherche par nom ou par ingrédient, filtres (déjeuner froid/chantier, dîner, ≤ 20 min, économique, restes, sans viande, favoris). La fiche donne les quantités **par profil**, les étapes, les temps, la conservation, le transport et les allergènes.
- **Courses** : liste par rayon, cases persistantes, détail des sources, « J'en ai déjà », saisie de prix, articles manuels, section placard, budget, comparaison de magasins (uniquement si vous avez saisi des prix pour au moins deux magasins).
- **Paramètres** : valeurs supposées, profils (facteurs par type d'aliment, lieu du déjeuner, micro-ondes, compléments par défaut), repères nutritionnels, jours de préparation, limites, exclusions, placard, prix, conseils de conservation, export/import/réinitialisation.

### Modèle de données (résumé)

| Objet | Champs clés |
| --- | --- |
| `Ingredient` | `id`, `aisle`, `unit` (g/ml/pc), `pieceWeightG?`, `densityGPerMl?`, `pack?`, `allergens?`, `staple?` |
| `Recipe` | `meals`, `lunchbox`, `temperature`, `activeMin`, `totalMin`, `costLevel`, `mainIngredient`, `ingredients[]` (pour **1 portion standard**, avec `role`), `steps`, `fridgeDays`, `freezable`, `quickAssembly?`, `suggestedSides`, `defaultSide` |
| `Profile` | `factors {portion, feculent, legume, proteine, sauce}`, `lunchPlace`, `microwaveAtLunch`, `defaultLunchExtras` |
| `Slot` | `recipeId` **ou** `leftoverOf`, `prepDay`, `extraPortions`, `diners[profil] {present, portion, sideId, extras}` |
| `AppState` | `profiles`, `settings`, `plan`, `pantry`, `manualItems`, `checked`, `prices`, `favorites` |

**Calcul d'une quantité** : `qty_recette × facteur_portion_profil × facteur_rôle_profil × portion_du_repas`. Les compléments restent à quantité fixe.

**Restes** : un repas « restes » ne déclenche aucune cuisson propre. Chaque repas réellement mangé est compté une seule fois, et la quantité à cuisiner au créneau source additionne ses convives, ceux des repas réservés et les portions en plus.

## Ce qui est supposé (modifiable dans Paramètres)

Vous déjeunez tous les deux au travail, sans micro-ondes. Préparation groupée le samedi et le dimanche. Placard de base disponible. Point de départ modéré pour « Moi » (féculents ×0,85, sauces ×0,75, légumes ×1,25, protéines ×1,1), portions standard pour « Ma compagne ». Aucun budget, aucun magasin, aucun prix pré-rempli. Conditionnements indicatifs.

## Limites connues

- **Scan** : la caméra en direct exige HTTPS (GitHub Pages). La lecture de ticket et de dates par OCR se trompe parfois (0 lu 8, abréviations propres à chaque magasin) : chaque ligne est donc proposée à validation, jamais ajoutée en silence. La première lecture télécharge le moteur (≈ 5 Mo), ensuite il est en cache.
- **Open Food Facts** : il faut du réseau au moment du premier scan d'un produit ; un produit déjà scanné est reconnu hors ligne. Certains produits sont absents ou mal catégorisés : vous choisissez alors l'ingrédient, et ce choix est mémorisé.
- **Dates estimées** : sans lecture de l'emballage, la date limite est une estimation prudente par type de produit, affichée « estimée ».

- Pas de calcul de calories. C'est un choix : aucune cible n'est déduite de l'âge, de la taille et du poids.
- Les durées de conservation sont des repères prudents, pas une garantie sanitaire.
- Aucune source de prix en ligne n'est intégrée. La comparaison Auchan / E.Leclerc / Lidl repose uniquement sur vos relevés.
- Les données restent sur l'appareil. Pour les partager entre deux téléphones, utilisez l'export/import JSON.
- Génération de recettes par IA : non incluse. Si elle est ajoutée, l'appel doit passer par un petit serveur (ex. fonction serverless) qui garde la clé : jamais de clé dans le code client.

## Checklist de test sur iPhone

**Installation**
- [ ] Ouvrir l'URL GitHub Pages dans **Safari**, attendre le chargement complet.
- [ ] Partager › **Sur l'écran d'accueil** : vérifier le nom « Popote » et l'icône (assiette et fourchette).
- [ ] Lancer depuis l'écran d'accueil : pas de barre d'adresse, barre d'onglets au-dessus de la barre d'accueil, rien sous l'encoche.

**Hors ligne**
- [ ] Ouvrir l'app une fois en ligne, la fermer (balayer), activer le **mode Avion**.
- [ ] Relancer : les 4 onglets s'affichent, les recettes s'ouvrent, la liste se calcule.
- [ ] En mode Avion, modifier un repas, fermer, rouvrir : la modification est conservée.

**Persistance**
- [ ] Remplir le planning, cocher 3 articles, ajouter un article manuel, fermer l'app complètement, rouvrir : tout est là.
- [ ] Paramètres › Exporter : le fichier `.json` s'enregistre dans Fichiers.
- [ ] Réinitialiser, puis Importer ce fichier : planning, profils, placard et cases cochées reviennent.

**Exactitude des portions**
- [ ] Recettes › *Pâtes pesto…* : la colonne « Moi » affiche 77 g de pâtes (90 × 0,85 = 76,5) et « Ma compagne » 90 g.
- [ ] Planning › un dîner › mettre « Ma compagne » à ×1,5 : dans Préparation, les quantités de ce plat augmentent de la moitié de sa part.
- [ ] Décocher « Ma compagne » sur un déjeuner : les ingrédients de ce repas baissent d'une portion dans Courses (touchez un article pour voir le détail).
- [ ] Un déjeuner « Moi » ne propose que des plats mangeables froids tant que « micro-ondes » est désactivé.

**Frigo et scan** (sur la version GitHub Pages)
- [ ] Frigo › Codes-barres : autoriser la caméra, viser un code (ex. une boîte d'œufs) : fiche pré-remplie (nom, marque, quantité, ingrédient). « Ajouter et scanner le suivant » enchaîne sur le produit suivant.
- [ ] Produit inconnu ou mode Avion : la fiche s'ouvre vide ; choisir l'ingrédient, enregistrer, rescanner le même code : il est reconnu sans réseau.
- [ ] 📷 Lire la date sur l'emballage : la date proposée correspond à la DLC imprimée (sinon la corriger à la main).
- [ ] Frigo › Ticket : photographier un ticket à plat. Les lignes reconnues sont cochées ; corriger une ligne « non reconnu », ajouter ; au ticket suivant, ce libellé est reconnu.
- [ ] Idées anti-gaspi : la première recette utilise le produit le plus proche de sa date. « Garder » puis « Ajouter au planning » : la recette apparaît dans le Planning et la liste de courses déduit le stock.
- [ ] Planning › Préparation › « C'est cuisiné » : les quantités utilisées disparaissent du stock (une seule fois).

**Restes et liste de courses**
- [ ] Sur un planning vide (« Nouvelle semaine »), choisir *Cuisses de poulet rôties* le samedi soir, puis cocher « Cuisiner en plus pour lundi midi » : lundi midi affiche « restes de samedi soir » et Préparation indique 4 repas.
- [ ] Dans Courses, les cuisses de poulet affichent un besoin de 4,2 (2 × 1,1 pour « Moi » + 2 × 1 pour « Ma compagne »), soit 5 cuisses à acheter, et pas davantage.
- [ ] Changer la recette du samedi soir : le lundi midi est libéré.
- [ ] Un même ingrédient présent dans plusieurs recettes n'apparaît qu'une fois, en quantité additionnée, avec ses sources.
- [ ] « J'en ai déjà » : l'article passe dans « Déjà au placard ».
- [ ] Saisir un prix pour un article : le budget indique le total **et** le nombre d'articles sans prix. Sans prix de deux magasins, la comparaison reste « non disponible ».
- [ ] Batch cooking : un plat au riz préparé le dimanche pour un mercredi affiche « ❄️ à congeler ».

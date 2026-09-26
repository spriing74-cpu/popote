# Popote — repas & courses pour deux

PWA en français pour planifier les repas **du dimanche au dimanche** par défaut (midi et soir, durée réglable de 1 à 14 jours), à deux profils (« Moi » et « Ma compagne »), avec une préparation groupée le week-end et une **liste de courses calculée** depuis le planning réel. Elle fonctionne hors ligne, sans compte ni clé d'API, et s'héberge gratuitement sur GitHub Pages.

## Démarrer

```bash
npm install
npm test            # 94 tests : portions, restes, courses, unités, conservation, durée du planning, reprise des anciennes sauvegardes, tickets (photo, PDF, texte), dates, codes-barres, stock, vide-frigo, prix, import TheMealDB, équipements, suggestions qui apprennent
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
    budget.ts            calculs de prix (le budget n'est plus affiché)
    nutrition.ts         repères nutritionnels par portion (table CIQUAL)
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
    PlanningScreen.tsx, MealSheet.tsx, SlotEditor.tsx, RecipesScreen.tsx, RecipeDetail.tsx, ShoppingScreen.tsx, SettingsScreen.tsx, common.tsx, icons.tsx
```

Les dépendances vont de l'interface vers le domaine, jamais l'inverse. La liste de courses ne lit **jamais de texte libre** : elle additionne des lignes `{ingredientId, qty, unit, role}`.

### Écrans

- **Semaine** : dimanche → dimanche par défaut ; premier jour et durée (1 à 14 jours) réglables depuis l'icône en haut à droite, qui propose aussi « Nouvelle semaine ». Une frise de jours permet de sauter à un jour. Un appui sur un repas **affiche directement la recette** (un créneau vide ouvre le choix d'un plat) ; le crayon ouvre les réglages du repas : recette ou restes d'un repas antérieur ; présence, portion (×0,5 à ×2), accompagnement et compléments de chaque personne ; jour de préparation ; portions en plus ; réservation de restes pour des repas ultérieurs. L'onglet **Batch cooking** liste, par session, les quantités totales à cuisiner et les alertes de conservation.
- **Frigo** : stock trié par urgence (date dépassée, 2 jours, semaine, plus tard). Trois façons d'ajouter : **codes-barres** en série (caméra en direct en HTTPS, sinon photo ou saisie des chiffres), **ticket de caisse** (photo, **PDF** de ticket en ligne ou de commande drive — texte lu directement, pages scannées passées à l'OCR —, image de la galerie ou texte collé depuis un e-mail ; validation ligne par ligne, abréviations apprises), **à la main**. Pour chaque produit, la date limite peut être **lue sur l'emballage** (photo) ou estimée. L'onglet **Idées anti-gaspi** propose des recettes vide-frigo générées hors ligne (omelette, poêlée, gratin, soupe, quiche, salade, pâtes) avec ce qui périme en premier, et les recettes du catalogue qui utilisent le stock. Une idée « gardée » se planifie comme une recette normale.
- **Ma cuisine** (Réglages) : déclarez four, airfryer, micro-ondes, plaques, autocuiseur. Chaque recette affiche « Avec votre équipement » : chaleur tournante −20 °C, airfryer (température, durée −20 %, fournées selon le panier), temps de réchauffage selon les watts, durée sous pression. La référence se lit sur la plaque signalétique (photo, sans IA). Avec le **service IA personnel** (dossier `worker/`, guide dans `worker/README.md`), l’app peut aussi reconnaître l’appareil sur photo et chercher sa notice sur le web pour en tirer les réglages du fabricant, avec leurs sources.
- **Recettes** : accueil en rayons à faire défiler (avec ce qu'il y a au frigo, préférées, prêt en 20 minutes, à découvrir, boîte du midi, batch cooking, sans viande — renouvelés chaque jour), « Envies » par famille de plats, recherche triable (pertinence, rapidité, A–Z) et accès aux recettes du monde en ligne. La fiche : illustration, onglets **Ingrédients** (pour nous deux / chacun / n portions, ce qui est déjà au frigo ou au placard, ingrédients à cocher, « Ajouter les manquants aux courses »), **Étapes** (minuteurs détectés dans le texte) et **Infos** (équipement, repères nutritionnels, conservation, allergènes), « Ajouter à la semaine » en grille jours × midi / soir, et des recettes proches. **Mode cuisine** : une étape par écran, balayage, écran allumé, minuteurs qui continuent dans toute l'app, et « c'était bon ? » à la fin.
- **Courses** : liste par rayon, progression, cases persistantes, détail des sources, « J'en ai toujours », ajout rapide (« 2 éponges »), partage, section « déjà à la maison ». Le budget indicatif a été retiré ; les relevés de prix restent dans Réglages.
- **Réglages** : rubriques Foyer (profils : jours travaillés, lieu du déjeuner, micro-ondes, facteurs, compléments), Planning (semaine et batch cooking, suggestions, goûts et exclusions dont les plats « plus jamais »), Cuisine et courses (équipements, placard, courses, prix, scan), Apparence (**Liquid Glass** ou **Nothing**, clair / sombre / auto), Données et aide (sauvegarde, service IA, conseils et sources).

### Courses en magasin, session batch, import de recettes

- **Mode magasin** (Courses) : plein écran, gros texte, écran allumé, rayons dans l'ordre du magasin choisi (Auchan, E.Leclerc, Lidl…), ce qui est pris descend dans « Dans le panier ». L'ordre des rayons se règle à la main (« Rayons ») ou s'apprend : à la fin des courses, Popote propose de retenir l'ordre dans lequel vous avez coché les rayons.
- **Plan minuté de la session** (Semaine › Batch cooking) : ordre de lancement calculé pour que four et feux travaillent en même temps (cuissons longues d'abord, accompagnements à la fin, 2 plats au four et 3 feux au plus, un seul cuisinier), heures réelles une fois démarré, minuteurs, quantités, étiquettes des boîtes (❄️ à congeler), et « Tout est cuisiné » qui met le frigo à jour.
- **Ajouter une recette** (Recettes › +) : depuis un lien (données schema.org des sites de recettes ; si le site bloque la lecture, via le service personnel `GET /recipe` ou en collant le texte du mode Lecteur de Safari), une ou plusieurs photos (lecture sur le téléphone) ou un texte collé. Chaque ingrédient est relu et rattaché au catalogue ; les quantités sont ramenées à une portion.
- **Minuteur de l'iPhone** (Réglages › iPhone) : via un raccourci « Minuteur Popote » de l'app Raccourcis, qui sonne même écran verrouillé.

### Expérience iPhone

- **Gestes** : balayer depuis le bord gauche pour revenir (l'écran suit le doigt) ; balayer un repas vers la droite pour une autre idée, vers la gauche pour le vider ; dans Courses, balayer vers la droite pour cocher, vers la gauche pour « j'en ai toujours » (ou supprimer un article ajouté) ; dans Frigo, balayer pour modifier ou retirer un produit. Un balayage complet déclenche l'action directement.
- **Appui long** sur un repas ou une recette : menu d'actions iOS. Les confirmations utilisent des feuilles d'action iOS (plus de fenêtres du navigateur).
- **Retours haptiques** (iOS 18+, désactivables), interrupteurs natifs.
- Grand titre qui se replie en barre floutée, barre d'onglets qui se rétracte en défilant, re-toucher un onglet remonte en haut, chaque onglet garde sa position, transitions animées.
- **Écrans de démarrage** pour tous les iPhone récents (`npm run icons`), **pastille** sur l'icône (produits à manger d'ici 2 jours, après accord des notifications, aucune notification envoyée), **écran toujours allumé** pendant une recette, bouton retour d'Android / de Safari pris en charge.

### Modèle de données (résumé)

| Objet | Champs clés |
| --- | --- |
| `Ingredient` | `id`, `aisle`, `unit` (g/ml/pc), `pieceWeightG?`, `densityGPerMl?`, `pack?`, `allergens?`, `staple?` |
| `Recipe` | `meals`, `lunchbox`, `temperature`, `activeMin`, `totalMin`, `costLevel`, `mainIngredient`, `ingredients[]` (pour **1 portion standard**, avec `role`), `steps`, `fridgeDays`, `freezable`, `quickAssembly?`, `suggestedSides`, `defaultSide` |
| `Profile` | `factors {portion, feculent, legume, proteine, sauce}`, `lunchPlace`, `workWeekdays`, `microwaveAtLunch`, `defaultLunchExtras` |
| `WeekPlan` | `weekOf` (premier jour), `days`, `slots` indexés `d0-dejeuner` … `d13-diner` |
| `Slot` | `recipeId` **ou** `leftoverOf`, `prepDay` (`d0`, `d1`…), `extraPortions`, `diners[profil] {present, portion, sideId, extras}` |
| `AppState` | `profiles`, `settings`, `plan`, `pantry`, `manualItems`, `checked`, `prices`, `favorites` |

**Calcul d'une quantité** : `qty_recette × facteur_portion_profil × facteur_rôle_profil × portion_du_repas`. Les compléments restent à quantité fixe.

**Restes** : un repas « restes » ne déclenche aucune cuisson propre. Chaque repas réellement mangé est compté une seule fois, et la quantité à cuisiner au créneau source additionne ses convives, ceux des repas réservés et les portions en plus.

## Ce qui est supposé (modifiable dans Paramètres)

Planning du dimanche au dimanche. Vous déjeunez tous les deux au travail du lundi au vendredi, sans micro-ondes, à la maison le week-end. Préparation groupée le samedi et le dimanche. Placard de base disponible. Point de départ modéré pour « Moi » (féculents ×0,85, sauces ×0,75, légumes ×1,25, protéines ×1,1), portions standard pour « Ma compagne ». Aucun budget, aucun magasin, aucun prix pré-rempli. Conditionnements indicatifs.

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
- [ ] Relancer : les 5 onglets s'affichent, les recettes s'ouvrent, la liste se calcule.
- [ ] En mode Avion, modifier un repas, fermer, rouvrir : la modification est conservée.

**Persistance**
- [ ] Remplir le planning, cocher 3 articles, ajouter un article manuel, fermer l'app complètement, rouvrir : tout est là.
- [ ] Paramètres › Exporter : le fichier `.json` s'enregistre dans Fichiers.
- [ ] Réinitialiser, puis Importer ce fichier : planning, profils, placard et cases cochées reviennent.

**Exactitude des portions**
- [ ] Recettes › *Pâtes pesto…* : la colonne « Moi » affiche 77 g de pâtes (90 × 0,85 = 76,5) et « Ma compagne » 90 g.
- [ ] Planning › un dîner › mettre « Ma compagne » à ×1,5 : dans Préparation, les quantités de ce plat augmentent de la moitié de sa part.
- [ ] Décocher « Ma compagne » sur un déjeuner : les ingrédients de ce repas baissent d'une portion dans Courses (touchez un article pour voir le détail).
- [ ] Un déjeuner « Moi » d'un jour travaillé ne propose que des plats mangeables froids tant que « micro-ondes » est désactivé ; le samedi et le dimanche, les plats chauds sont proposés.
- [ ] Semaine › toucher un repas rempli : la recette s'affiche directement ; un créneau vide ouvre la liste des plats.
- [ ] Semaine › icône de réglage › « Dim → dim » : 8 jours, 16 repas ; « 5 jours » demande confirmation si des repas seront supprimés.

**Frigo et scan** (sur la version GitHub Pages)
- [ ] Frigo › Codes-barres : autoriser la caméra, viser un code (ex. une boîte d'œufs) : fiche pré-remplie (nom, marque, quantité, ingrédient). « Ajouter et scanner le suivant » enchaîne sur le produit suivant.
- [ ] Produit inconnu ou mode Avion : la fiche s'ouvre vide ; choisir l'ingrédient, enregistrer, rescanner le même code : il est reconnu sans réseau.
- [ ] 📷 Lire la date sur l'emballage : la date proposée correspond à la DLC imprimée (sinon la corriger à la main).
- [ ] Frigo › Ticket › Importer un PDF : choisir le PDF d'une commande drive (app Fichiers) : les articles et quantités apparaissent sans OCR.
- [ ] Frigo › Ticket : photographier un ticket à plat. Les lignes reconnues sont cochées ; corriger une ligne « non reconnu », ajouter ; au ticket suivant, ce libellé est reconnu.
- [ ] Idées anti-gaspi : la première recette utilise le produit le plus proche de sa date. « Garder » puis « Ajouter au planning » : la recette apparaît dans le Planning et la liste de courses déduit le stock.
- [ ] Planning › Préparation › « C'est cuisiné » : les quantités utilisées disparaissent du stock (une seule fois).

**Restes et liste de courses**
- [ ] Sur un planning vide (« Nouvelle semaine »), choisir *Cuisses de poulet rôties* le dimanche soir, puis (crayon › « Cuisiner en plus pour… ») cocher lundi midi : lundi midi affiche « restes de dimanche soir » et Batch cooking indique 4 repas.
- [ ] Dans Courses, les cuisses de poulet affichent un besoin de 4,2 (2 × 1,1 pour « Moi » + 2 × 1 pour « Ma compagne »), soit 5 cuisses à acheter, et pas davantage.
- [ ] Changer la recette du dimanche soir : le lundi midi est libéré.
- [ ] Un même ingrédient présent dans plusieurs recettes n'apparaît qu'une fois, en quantité additionnée, avec ses sources.
- [ ] « J'en ai toujours » : l'article passe dans « Déjà à la maison ».
- [ ] Batch cooking : un plat au riz préparé le dimanche pour un mercredi affiche « ❄️ à congeler ».

import type { ReactNode } from 'react';
import type { Recipe } from '../domain/types';
import { useStore } from '../state/store';
import { categoryStyle } from './common';
import { Icon } from './icons';
import { useDialog } from './dialog';
import { useLongPress } from './ios';

/** Illustration d'une recette : photo si elle existe, sinon dégradé de sa famille et grand emoji. */
export function RecipeArt({ recipe, size = 'md' }: { recipe: Recipe; size?: 'sm' | 'md' | 'lg' }) {
  const st = categoryStyle(recipe.category);
  return (
    <span className={`recipe-art ${size}`} style={{ background: `linear-gradient(145deg, ${st.from}, ${st.to})` }} aria-hidden>
      {recipe.imageUrl ? <img src={recipe.imageUrl} alt="" loading="lazy" /> : <span className="art-emoji">{st.emoji}</span>}
    </span>
  );
}

/** Menu d'actions d'une recette (appui long). */
export function useRecipeMenu(recipe: Recipe, onOpen: () => void) {
  const { state, dispatch } = useStore();
  const dialog = useDialog();
  const fav = state.favorites.includes(recipe.id);
  const rating = state.ratings[recipe.id];
  return useLongPress(async () => {
    const c = await dialog.actions({
      title: recipe.name,
      actions: [
        { id: 'voir', label: 'Voir la recette' },
        { id: 'fav', label: fav ? 'Retirer des favoris' : '★ Ajouter aux favoris' },
        { id: 'aime', label: rating === 1 ? 'Retirer « On aime »' : '👍 On aime' },
        { id: 'jamais', label: rating === -1 ? 'Autoriser à nouveau' : '👎 Plus jamais', destructive: rating !== -1 },
      ],
    });
    if (c === 'voir') onOpen();
    if (c === 'fav') dispatch({ type: 'toggleFavorite', recipeId: recipe.id });
    if (c === 'aime') dispatch({ type: 'rateRecipe', recipeId: recipe.id, value: rating === 1 ? 0 : 1 });
    if (c === 'jamais') dispatch({ type: 'rateRecipe', recipeId: recipe.id, value: rating === -1 ? 0 : -1 });
  });
}

/** Grande vignette des rayons. */
export function RecipeTile({ recipe, onOpen, note }: { recipe: Recipe; onOpen: () => void; note?: ReactNode }) {
  const { state } = useStore();
  const press = useRecipeMenu(recipe, onOpen);
  return (
    <button className="rtile" onClick={onOpen} {...press}>
      <RecipeArt recipe={recipe} />
      {state.favorites.includes(recipe.id) && <span className="rtile-fav">★</span>}
      <span className="rtile-name">{recipe.name}</span>
      <span className="rtile-meta">
        <Icon name="clock" size={13} /> {recipe.activeMin} min{note ? <> · {note}</> : null}
      </span>
    </button>
  );
}


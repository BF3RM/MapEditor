import { LinearTransform } from '@/script/types/primitives/LinearTransform';

export interface IGameEntity {
	onSelect: () => void;
	onDeselect: () => void;
	onHighlight: () => void;
	onUnhighlight: () => void;
}

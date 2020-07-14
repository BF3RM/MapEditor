import { LinearTransform } from '@/script/types/primitives/LinearTransform';

export interface IGameEntity {
	transform: LinearTransform
	onSelect: () => void;
	onDeselect: () => void;
	onHighlight: () => void;
	onUnhighlight: () => void;
}

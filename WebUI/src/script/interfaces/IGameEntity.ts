export interface IGameEntity {
	onSelect: () => void;
	onDeselect: () => void;
	onHighlight: () => void;
	onUnhighlight: () => void;
}

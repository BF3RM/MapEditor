import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { VextCommand } from '@/script/types/VextCommand';
import Command from '@/script/libs/three/Command';
import { CtrRef } from '@/script/types/CtrRef';
import { Guid } from '@/script/types/Guid';

export interface IEBXFieldData {
	guid?: Guid;
	reference?: CtrRef | undefined;
	field: string;
	type: string;
	/** Terminal "point this field at that instance"; value is {partitionGuid, instanceGuid}. */
	ref?: boolean;
	value?: any;
	oldValue?: any | undefined;
}
/** Dot-path of the edited leaf (e.g. "objects.2.radius"), used as the merge identity. */
function describePath(node: any): string {
	const parts: string[] = [];
	let cur = node;
	while (cur && typeof cur === 'object' && 'field' in cur) {
		parts.push(String(cur.field));
		cur = cur.value;
	}
	return parts.join('.');
}

export default class SetEBXFieldCommand extends Command {
	constructor(public EBXFieldUpdateData: IEBXFieldData) {
		super('SetEBXFieldCommand');
		this.name = 'Change EBX Data';
		// Dragging a slider or typing in a numeric field fires one command per tick/keystroke,
		// which used to flood History with near-identical entries. Consecutive edits to the SAME
		// field on the SAME object now merge into one entry (History's 500ms window).
		this.updatable = true;
		this.mergeKey = `${EBXFieldUpdateData.guid}:${describePath(EBXFieldUpdateData.value)}`;
	}

	/**
	 * Fold a newer edit of the same field into this command. Deliberately keeps the ORIGINAL
	 * value chain's oldValue, so undoing the merged entry returns to the value the field had
	 * before the drag started rather than to the previous tick.
	 */
	public update(cmd: SetEBXFieldCommand) {
		this.EBXFieldUpdateData.value = cmd.EBXFieldUpdateData.value;
		this.timeStamp = cmd.timeStamp;
	}

	public execute() {
		const gameObjectTransferData = new GameObjectTransferData({
			guid: this.EBXFieldUpdateData.guid,
			overrides: [
				{
					field: this.EBXFieldUpdateData.field,
					value: this.EBXFieldUpdateData.value,
					type: this.EBXFieldUpdateData.type,
					ref: this.EBXFieldUpdateData.ref,
					reference: this.EBXFieldUpdateData.reference
				}
			]
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}

	public undo() {
		// A reference change has to be undone AS a reference change. Without `ref` the ext walks
		// the node as a normal field chain, and oldValue is a {partitionGuid, instanceGuid} table
		// rather than a scalar — so the undo would either do nothing or null the field. Both look
		// like the picker half-worked.
		const gameObjectTransferData = new GameObjectTransferData({
			guid: this.EBXFieldUpdateData.guid,
			overrides: [
				{
					field: this.EBXFieldUpdateData.field,
					value: this.EBXFieldUpdateData.oldValue,
					type: this.EBXFieldUpdateData.type,
					ref: this.EBXFieldUpdateData.ref,
					reference: this.EBXFieldUpdateData.reference
				}
			]
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}
}

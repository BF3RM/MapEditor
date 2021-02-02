import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { VextCommand } from '@/script/types/VextCommand';
import Command from '@/script/libs/three/Command';
import { CtrRef } from '@/script/types/CtrRef';
import { Guid } from '@/script/types/Guid';
import { isPrintable } from '@/script/modules/Utils';

export interface IEBXFieldData {
	guid?: Guid,
	reference?: CtrRef | undefined,
	field: string,
	type: string,
	value?: any,
	oldValue?: any | undefined,
}
export default class SetEBXFieldCommand extends Command {
	private oldValue: any = null;
	constructor(public EBXFieldUpdateData: IEBXFieldData) {
		super('SetEBXFieldCommand');
		this.name = 'Change EBX Data';
		this.getOldValue(EBXFieldUpdateData);
	}

	public execute() {
		const gameObjectTransferData = new GameObjectTransferData({
			guid: this.EBXFieldUpdateData.guid,
			overrides: [{
				field: this.EBXFieldUpdateData.field,
				value: this.EBXFieldUpdateData.value,
				type: this.EBXFieldUpdateData.type,
				reference: this.EBXFieldUpdateData.reference
			}]
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}

	public undo() {
		const gameObjectTransferData = new GameObjectTransferData({
			guid: this.EBXFieldUpdateData.guid,
			overrides: [{
				field: this.EBXFieldUpdateData.field,
				value: this.oldValue,
				type: this.EBXFieldUpdateData.type,
				reference: this.EBXFieldUpdateData.reference
			}]
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}

	private getOldValue(updateData: IEBXFieldData) {
		this.oldValue = JSON.parse(JSON.stringify(updateData));
		let data = this.oldValue;
		while (!isPrintable(data.type)) {
			data = data.value;
		}
		data.value = data.oldValue;
	}
}

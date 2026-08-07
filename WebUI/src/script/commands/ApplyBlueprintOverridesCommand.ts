import { GameObjectTransferData } from '@/script/types/GameObjectTransferData';
import { VextCommand } from '@/script/types/VextCommand';
import Command from '@/script/libs/three/Command';
import { CtrRef } from '@/script/types/CtrRef';
import { Guid } from '@/script/types/Guid';
import { IEBXFieldData } from '@/script/commands/SetEBXFieldCommand';

export interface IApplyBlueprintOverridesData {
	guid: Guid;
	reference?: CtrRef | undefined;
	overrides: { [path: string]: IEBXFieldData };
}

// "Apply to Blueprint" (Unity's Apply-to-Prefab). Pushes an instance's accumulated per-instance
// EBX overrides onto the shared base blueprint, then rebuilds every instance of that blueprint
// with the new base — instances that have their own not-yet-applied overrides keep them on top.
// The applying instance's overrides are cleared, since they're now baked into the base.
export default class ApplyBlueprintOverridesCommand extends Command {
	constructor(public data: IApplyBlueprintOverridesData) {
		super('ApplyBlueprintOverridesCommand');
		this.name = 'Apply Overrides to Blueprint';
	}

	public execute() {
		// The ext-side GameObject already holds the accumulated overrides; the guid is enough to
		// resolve which instance's overrides to promote. We still send them for traceability.
		const gameObjectTransferData = new GameObjectTransferData({
			guid: this.data.guid,
			overrides: Object.values(this.data.overrides)
		});
		window.vext.SendCommand(new VextCommand(this.type, gameObjectTransferData));
	}

	// Not undoable in one shot (it mutates the shared blueprint + rebuilds every instance). A
	// no-op keeps it out of the undo stack cleanly rather than doing something half-correct.
	public undo() {}
}

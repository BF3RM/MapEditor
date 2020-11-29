import Rete, {Node} from 'rete';
import InstanceNode from './InstanceNode.vue';
import Partition from '../../ebx/Partition';

export default class InstanceComponent extends Rete.Component {

    public data: { [key: string]: any } = {};

    constructor(props: { partition: Partition }) {
        super('instance');
        this.data.render = 'vue';
        this.data.component = InstanceNode;
        this.data.props = props;
    }

    async builder(node: Node) {
    }

    worker(): void {
    }

};

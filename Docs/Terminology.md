# Commands
Commands are "authenticated" actions that are verified, stored and replicated on all users.
All commands have an Execute and an Undo action. The undo action is the opposite of the execute action.

For example:
Execute: SetTransform(newTransform)
Undo: SetTransform(OldTransform)

When a command is executed, it's added to the history, and sent to the client, which then sends it to the server. The server will then respond to the client, which sends the same response back to the UI.
Only the response should execute a UI update. The commands themselves shouldn't perform any action in the UI when executed.

# Messages
Messages are "unauthenticated" actions that are only replicated on the client.
They are assumed to be successful, regardless of actual state.

Messages should only be used to rapidly update values. For example when you're dragging an object, or changing some value through a slider.

Messages can be updated as often as possible on the UI, but only the latest message for each object will be executed on the client.

They are sent on a fixed interval.

# Signals
Signals are "events" that are dispatched every time an command is executed.
The editor will receive the signals first, and do the action accordingly.
Modules can subscribe to these signals, allowing them to update *their* values accordingly.

# Blueprint
Reference of frostbite's blueprints, which can spawn more than one entity. 

# Prefab
Reference of frostbite's prefabs, which can spawn more than one blueprint. 

# GameObject
Three.js Object3D subclass that represents the container of entities that blueprints or prefabs create. These objects are attached to the selection Group, and they hold the entity/entities as children. These entities are represented as GameEntities.

# GameEntity
Three.js Object3D subclass that represent the entities created by a blueprint or prefab. They aren't selectable, they only move with the GameObject that contains them and they have AABB (Axis Aligned Bounding Box).

# Group
Three.js Group subclass that can hold multiple GameEntities or other Groups to move them and their children together.

# SelectionGroup
Group subclass, where only one instance exists with the purpose of adding selected objects to it allowing multiselection. The Gizmo is only attached to this intance.

#InstanceManager
Class that handles the rendering of GameEntities, as they GameEntities themselves don't have 
meshes. This is because all entities are rendered as one instancedMesh, as they are all
bounding boxes with the same exact mesh. The class sets and updates the position, scale, color and visibility of each 
entity.
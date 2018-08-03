/**
 * @author dforrer / https://github.com/dforrer
 * Developed as part of a project at University of Applied Sciences and Arts Northwestern Switzerland (www.fhnw.ch)
 */

/**
 * @param object GameObject
 * @param newPosition Vec3
 * @param optionalOldPosition Vec3
 * @constructor
 */

var SetPositionCommand = function ( object, newPosition, optionalOldPosition ) {

    Command.call( this );

    this.type = 'SetPositionCommand';
    this.name = 'Set Position';

    this.object = object;

    if ( object !== undefined && newPosition !== undefined ) {

        this.oldPosition = object.transform.Clone();
        this.newPosition = newPosition.Clone();

    }

    if ( optionalOldPosition !== undefined ) {
        this.oldPosition = optionalOldPosition.Clone();
    }
};


SetPositionCommand.prototype = {

    execute: function () {
        this.object.position.copy( this.newPosition );
        this.object.updateMatrixWorld( true );
    },

    undo: function () {

        this.object.position.copy( this.oldPosition );
        this.object.updateMatrixWorld( true );
    },
};
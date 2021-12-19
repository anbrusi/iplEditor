let editor = undefined;
export function createIplEditor(parentid) {
    editor = new IplEditor(parentid);
}


const textAreaBorderColor = '#ccffcc';
const imageAreaBorderColor = '#ccccff';
const selectedAreaBorderColor = '#ffaaaa';

const areaLocationTolerance = 5;

/* Geometry

-------------------------------------------------------------
|                                                           |
|  =====================================================    |           -------------------
|  |    EditorDoc                                      |    |
|  |                                                   |    |           workspace.scrollTop
|  ||-------------------------------------------------||    | -------
|  ||   Modebar                                       ||    | |
|  ||-------------------------------------------------||    | | editor  -------------------
|  ||   Workspace                                     ||    | | div
|  ||                                                 ||    | |
|  ||-------------------------------------------------||    | -------
|  |                                                   |    |
|  |                                                   |    |
|  |                                                   |    |
|  =====================================================    | 
-------------------------------------------------------------

The editor is a div set by the calling HTML and styled by CSS. 
Only height is mandatory in the CSS, Width adapts to the browser viewport,
but can be set in CSS, if required. The id of this div is the only info
transmitted from HTML to js. It is a parameter of the call createIplEditor("id of the container div").
Everything else is built up by js. The visible part is Modebar, which is a div with the buttons 
that determine the mode of iplEditor, followed by the workspace. The workspace is a div, 
which constitutes a window on EditorDoc, which is the document issued by the editor.

Everything is positioned with respect to EditorDoc. We call this the EditorDoc coordinate system.
Technically the parent of EditorDoc is the client part of Workspace. 
Worksapce has position relative. Content of EditorDoc, such as text areas and image areas have position absolute,
using EditorDoc coordinates.

*/

class IplEditor {
    /**
     * Creates an iplEditor inside a container div with id parentid. The iplEditor is styled by CSS of the class 'iplWorkspace'
     * First an object of class Modebar for the selection of the mode of iplEditor is inserted in the container.
     * Then a workspace, styled by the CSS class 'iplWorkspace' is inserted in the container. 
     * 
     * Properties
     * ==========
     *      - areas: an array holding TextAreas as well as ImageAreas
     *      - locationInfo: { nr: <the index in this.areas>,
     *                        location: <one of 'inside', 'outside', 'left', 'right'>
     *                       }
     *      - activeArea: { nr: <the index in this.areas>,
     *                      resizeMode; <one of 'inside', 'left', 'right'>,
     *                      resizing: <true iff rezizing is in course>,
     *                      mouseBase: <object with properties 'x' and 'y'. Defined only if resizing=true.>
     *                     }
     * 
     * @param {string} parentid 
     */
    constructor(parentid) {
        this.container = document.getElementById(parentid); // parent is a div in the DOM
        this.areas = []; 
        // Insert a 'modebar' a div containing the buttons for the mode choice  
        this.addModebar(); // Defines this.modebar
        // Insert 'workspace' a div with the editable part of iplEditor
        this.addWorkspace();
        this.addCanvas();
        // Initiate iplEditor
        this.init();
    }
    async init() {        
        // Only for test purposes
        await this.addTextArea(0,0,600);
        await this.addTextArea(400,500,300);
        this.addImageArea(200, 300, 100, 60);

        // Setup general defaults
        // if defined, this is the number of the active text area
        this.activeTextarea = undefined;
        this.ckEditorsSetReadOnly(true);
        // Setup the initial environment.
        // Later changes will be handled by this.nodebarClicked as a reaction to a click on a mode button
        this.setMode('modeArea');
        // Reflect the initial mode setting in modebar
        this.modebar.setMode('modeArea');
    }
    addModebar() {
        this.modebar = new Modebar(this);
        this.container.append(this.modebar.barDiv);
    }
    addWorkspace() {
        let containerStyle = getComputedStyle(this.container);
        let modebarStyle = getComputedStyle(this.modebar.barDiv);
        let height = parseInt(containerStyle.height) - parseInt(modebarStyle.height) - 
                    parseInt(containerStyle['border-bottom-width']) - parseInt(containerStyle['border-top-width']);
        // console.log('containerHeight=' + containerStyle.height + ', modebarHeight=' + modebarStyle.height);
        this.workspace = document.createElement('div');
        this.workspace.className = 'iplWorkspace';
        this.workspace.style.height = height + 'px';
        this.container.append(this.workspace);
        this.scrollTop = 0;
    }
    addCanvas() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'iplCanvas';
        this.workspace.append(this.canvas);
        let style = getComputedStyle(this.workspace);
        console.log('workspace height=' + style.height + ', width=' + style.width);
        let height = parseInt(style.height) - 4;
        let width = parseInt(style.width);
        /* Setting canvas CSS dimensions scales it. It does not work. HTML dimensions must be set instead.
        this.canvas.style.height = height + 'px';
        this.canvas.style.width = width + 'px';
        */
        this.canvas.height = height;
        this.canvas.width = width;
        window.addEventListener('resize', this.boundWindowResizeHandler);
    }
    /**
     * Sets the operation environment.
     * 
     * @param {string} mode 
     */
    setMode(mode) {
        // console.log('set mode to ' + mode)
        this.currentMode = mode;
        switch (mode) {
            case 'modeArea':
                this.locationInfo = undefined;
                this.activeArea = undefined;
                this.showAreaOutlines('defaultBorder');
                this.workspace.addEventListener('mousemove', this.boundWsAreaMousemoveHandler);
                this.workspace.addEventListener('mousedown', this.boundWsAreaMousedownHandler);
                this.workspace.addEventListener('mouseup', this.boundWsAreaMouseupHandler);
                break;
            case 'modeText':
                this.showAreaOutlines('defaultBorder');
                this.ckEditorsSetReadOnly(false);
                this.workspace.addEventListener('scroll', this.boundWsScrollHandler);
                window.addEventListener('scroll', this.boundWindowScrollHandler);
                break;
            case 'modeNewText':
                this.showAreaOutlines('defaultBorder');
                this.workspace.addEventListener('mousedown', this.boundNewAreaMousedownHandler);
                this.workspace.addEventListener('mousemove', this.boundNewAreaMousemoveHandler);
                this.workspace.addEventListener('mouseup', this.boundNewTextMouseupHandler);
                break;
            case 'modeNewImage':
                this.showAreaOutlines('defaultBorder');
                this.workspace.addEventListener('mousedown', this.boundNewAreaMousedownHandler);
                this.workspace.addEventListener('mousemove', this.boundNewAreaMousemoveHandler);
                this.workspace.addEventListener('mouseup', this.boundNewImageMouseupHandler);
                break;
            case 'modePencil':
                this.showAreaOutlines('noBorder');
                break;
        }
    }
    /**
     * Dismantels the operation environment.
     * 
     * @param {string} mode 
     */
    unsetMode(mode) {
        // console.log('unset mode ' + mode);
        switch (mode) {
            case 'modeArea':
                this.workspace.removeEventListener('mousemove', this.boundWsAreaMousemoveHandler);
                this.workspace.removeEventListener('mousedown', this.boundWsAreaMousedownHandler);
                this.workspace.removeEventListener('mouseup', this.boundWsAreaMouseupHandler);
                break;
            case 'modeText':
                this.ckEditorsSetReadOnly(true);
                this.workspace.removeEventListener('scroll', this.boundWsScrollHandler);
                window.removeEventListener('scroll', this.boundWindowScrollHandler);
                break;
            case 'modeNewText':
                this.workspace.removeEventListener('mousedown', this.boundNewAreaMousedownHandler);
                this.workspace.removeEventListener('mousemove', this.boundNewAreaMousemoveHandler);
                this.workspace.removeEventListener('mouseup', this.boundNewTextMouseupHandler);
                break;
            case 'modeNewImage':
                this.workspace.removeEventListener('mousedown', this.boundNewAreaMousedownHandler);
                this.workspace.removeEventListener('mousemove', this.boundNewAreaMousemoveHandler);
                this.workspace.removeEventListener('mouseup', this.boundNewImageMouseupHandler);
                break;
            case 'modePencil':
                break;
        }
    }
    /**
     * This method is called by Modebar, when a mode button is clicked.
     * It changes the environment in which IplEditor operates.
     * 
     * @param {string} mode 
     */
    modebarClicked(mode) {
        // Check if the mode has changed and act accordingly
        if (mode != this.currentMode) {
            this.unsetMode(this.currentMode);
            this.setMode(mode);
        }
    }
    /**
     * Adds a TextArea class to iplEditor. The effect is twofold
     * An object of class TextArea is created and pushed to the array this.textAreas,
     * the HTML node 'area' of this object is inserted as a child in the div this.workspace
     * 
     * @param {int} top 
     * @param {int} left 
     * @param {int} width 
     */
    async addTextArea(top, left, width) {
        let textArea = new TextArea(this, top, left, width);
        await textArea.init();
        // Register the TextArea
        this.areas.push(textArea);
        // Insert the TextArea HTML node textArea.area in the DOM
        this.workspace.append(textArea.area);
        textArea.setBorderColor('defaultBorder');
    }
    addImageArea(top, left, width, height) {
        let imageArea = new ImageArea(this, top, left, width, height);
        this.areas.push(imageArea);
        this.workspace.append(imageArea.area);
        imageArea.setBorderColor('defaultBorder');
    }
    /**
     * Disables or enables all ck-editors
     * 
     * @param {bool} yes 
     */
    ckEditorsSetReadOnly(yes) {
        for (let area of this.areas) {
            if (area instanceof TextArea) {
                area.setReadOnly(yes);
            }
        }
    }
    /**
     * If yes shows border of areas in standard colors, else hides area border
     * 
     * @param {string} One of 'noBorder' 'defaultBorder', 'selectedBorder'
     */
    showAreaOutlines(borderType) {
        for (let area of this.areas) {
            area.setBorderColor(borderType);
        }
    }
    /**
     * Returns an object with properties 'areaType', 'nr' and 'location'
     * If the position (x,y) can be classified with respect to any area, 'areaType' is the type (text or image)
     * 'nr' is the number of that area, else nr is undefined and 'location' is 'outside'.
     * If a classification is possible, areaType is the type, nr is the number of the area and 'location' is one of
     * 'top', 'bottom', 'left', 'right', 'inside'.
     * Text areas take precedence over image areas
     * 
     * @param {number} x 
     * @param {number} y 
     * @returns 
     */
    areaLocation(x, y) {
        let result = {
            nr: undefined,
            location: 'outside'
        }
        for (let i=0; i < this.areas.length; i++) {
            let location = this.areas[i].location(x, y);
            if (location !== 'outside') {
                result.nr = i;
                result.location = location;
                return result;
            }
        }
        return result;
    }
    setResizeCursor(location) {
        switch (location) {
            case 'inside':
                this.workspace.style.cursor = 'grab';
                break;
            case 'left':
            case 'right':
                this.workspace.style.cursor = 'ew-resize';
                break;
            default:
                this.workspace.style.cursor = 'default';
        }
    }
    /**
     * Fired when the whole browser window is resized
     * 
     * @param {object} event 
     */
    windowResizeHandler(event) {
        // Adapt the width of the canvas to the new workspace width.
        // Note that the workspace width adapts dynamically to the iplEditor width, 
        // which is dynamic unless given in CSS for the div holding iplEditor
        let style = getComputedStyle(this.workspace);
        // Be careful to adapt the HTML attribute, NOT the CSS style
        this.canvas.width = parseInt(style.width);
        // canvas height is always dynamic, but it depends on the length of the document issued from iplEditor
    }
    boundWindowResizeHandler = this.windowResizeHandler.bind(this);
    wsAreaMousemoveHandler(event) {
        let pos = elementMousePos(this.workspace, event);
        this.locationInfo = this.areaLocation(pos.x,pos.y);
        // console.log('Textarea=' + locationInfo.nr + ', location=' + locationInfo.location);
        if (this.activeArea !== undefined) {
            // We have an active area
            if (this.activeArea.resizing) {       
                let dx = pos.x - this.activeArea.mouseBase.x;
                let dy = pos.y - this.activeArea.mouseBase.y;
                switch (this.activeArea.resizeMode) {
                    case 'inside':
                        this.areas[this.activeArea.nr].moveBy(dx,dy);
                        break;
                    case 'left':
                        this.areas[this.activeArea.nr].resizeLeft(dx);
                        break;
                    case 'right':
                        this.areas[this.activeArea.nr].resizeRight(dx);
                        break;
                }
                this.activeArea.mouseBase = pos;
                // console.log('moved by dx=' + dx + ', dy=' + dy);
            } else {
                if (this.locationInfo.nr === undefined) {
                    // We are no longer in any active area. Inactivate the area
                    this.areas[this.activeArea.nr].setBorderColor('defaultBorder');
                    this.activeArea = undefined;
                    this.workspace.style.cursor = 'default';
                } else {
                    if (this.locationInfo.nr != this.activeArea.nr) {
                        // We changed from one active area into another
                        this.areas[this.activeArea.nr].setBorderColor('defaultBorder'); // Inactivate the old area
                        this.areas[this.locationInfo.nr].setBorderColor('selectedBorder'); // Activate the new area
                        this.activeArea.nr = this.locationInfo.nr;
                        this.activeArea.resizeMode = this.locationInfo.location;
                        this.setResizeCursor(this.activeArea.resizeMode);
                    }
                    if (this.locationInfo.location != this.activeArea.resizeMode) {
                        this.activeArea.resizeMode = this.locationInfo.location;
                        this.setResizeCursor(this.activeArea.resizeMode);
                    }
                }        
            }
        } else {
            // There is no active area, check if we entered an area and make it active
            if (this.locationInfo.nr !== undefined) {
                this.activeArea = {
                    nr: this.locationInfo.nr,
                    resizeMode: this.locationInfo.location
                }
                this.areas[this.locationInfo.nr].setBorderColor('selectedBorder');
                this.setResizeCursor(this.activeArea.resizeMode);
            }
        }
    }
    boundWsAreaMousemoveHandler = this.wsAreaMousemoveHandler.bind(this);
    wsAreaMousedownHandler(event) {
        // button == 0 is the left (primary) button
        if (this.activeArea && event.button == 0) {
            let pos = elementMousePos(this.workspace, event);
            this.activeArea.resizeMode = this.locationInfo.location;
            console.log('Set resize mode to ' + this.locationInfo.location);
            this.activeArea.resizing = true;
            this.activeArea.mouseBase = pos;
        }
    }
    boundWsAreaMousedownHandler = this.wsAreaMousedownHandler.bind(this);
    wsAreaMouseupHandler(event) {
        // button == 0 is the left (primary) button
        if (this.activeArea && event.button == 0) {
            this.activeArea.resizing = false;
        }
    }
    boundWsAreaMouseupHandler = this.wsAreaMouseupHandler.bind(this);
    /**
     * Fired when the document issued by iplEditor is scrolled within the workspace
     * 
     * @param {object} event 
     */
    wsScrollHandler(event) {
        // Disable areas scrolled out of view and reenable them if they enter the workspace
        for (let i= 0; i < this.textAreas.length; i++) {
            this.textAreas[i].setVisibility();
        }
        // Adapt the height of the canvas. The height can only grow
        let style = getComputedStyle(this.canvas);
        let scrollTop = parseInt(this.workspace.scrollTop);
        if (scrollTop > this.scrollTop) {
            console.log('Detected canvas growth');
            let height = parseInt(style.height) + scrollTop - this.scrollTop;
            /* Do not set CSS height, Set HTML height
            this.canvas.style.height = height + 'px';
            */
            this.canvas.height = height;
            this.scrollTop = scrollTop;
        }

    }
    boundWsScrollHandler = this.wsScrollHandler.bind(this);
    /**
     * Fired, if the whole document containing iplEditor is scrolled within the browser window
     * 
     * @param {object} event 
     */
    windowScrollHandler(event) {
        // Adjust sticky position of visible text areas, when the whole document is scrolled in the browser window
        // Sticky positions are with respect to the viewport and must be adapted to have a fixed place in the document      
        for (let i= 0; i < this.textAreas.length; i++) {
            if (this.textAreas[i].visible) {
                this.textAreas[i].setStickyPosition();
            }
        }
    }
    boundWindowScrollHandler = this.windowScrollHandler.bind(this);
    newAreaMousedownHandler(event) {
        let pos = elementMousePos(this.workspace, event);
        console.log('Mousedown x=' + pos.x + ', y=' + pos.y);
        this.mouseBase = pos; // Rubbering base point
        this.oldRect = {
            height: 0,
            width: 0
        };
    }
    boundNewAreaMousedownHandler = this.newAreaMousedownHandler.bind(this);
    newAreaMousemoveHandler(event) {
        let pos = elementMousePos(this.workspace, event);
        if (this.mouseBase) {
            // console.log('x=' + pos.x + ', y=' + pos.y);
            let ctx = this.canvas.getContext('2d');
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'red';
            ctx.clearRect(this.mouseBase.x - 1, this.mouseBase.y - 1, this.oldRect.width, this.oldRect.height);
            let width = pos.x - this.mouseBase.x;
            let height = pos.y - this.mouseBase.y;
            ctx.strokeRect(this.mouseBase.x, this.mouseBase.y, width, height);
            this.oldRect = {
                height: height + 2,
                width: width + 2
            }
        }
    }
    boundNewAreaMousemoveHandler = this.newAreaMousemoveHandler.bind(this);
    newTextMouseupHandler(event) {
        let ctx = this.canvas.getContext('2d');
        ctx.clearRect(this.mouseBase.x - 1, this.mouseBase.y - 1, this.oldRect.width, this.oldRect.height);
        let pos = elementMousePos(this.workspace, event);
        let width = pos.x - this.mouseBase.x;
        if (width > 5) {
            if (width < 40) {
                width = 40;
            }
            this.addTextArea(this.mouseBase.y, this.mouseBase.x, width);
        }
        this.mouseBase = undefined;
    }
    boundNewTextMouseupHandler = this.newTextMouseupHandler.bind(this);
    newImageMouseupHandler(event) {
        let ctx = this.canvas.getContext('2d');
        ctx.clearRect(this.mouseBase.x - 1, this.mouseBase.y - 1, this.oldRect.width, this.oldRect.height);
        let pos = elementMousePos(this.workspace, event);
        let width = pos.x - this.mouseBase.x;
        let height = pos.y - this.mouseBase.y;
        if (width > 5) {
            if (width < 40) {
                width = 40;
            }
            if (height <40) {
                height = 40;
            }
            this.addImageArea(this.mouseBase.y, this.mouseBase.x, width, height);
        }
        this.mouseBase = undefined;
    }
    boundNewImageMouseupHandler = this.newImageMouseupHandler.bind(this);
}
class Modebar {
    constructor(parent) {
        this.iplEditor = parent;    
        this.barDiv = document.createElement('div');
        this.barDiv.className = 'iplNodebar';
        // this.buttons is an array of HTML img buttons in Modebar
        this.buttons = [
            button('modeArea', '/isImg/isOriginalImg.png', 'Handle text areas'),
            button('modeNewText', '/isImg/isAreaTxt.png', 'Insert new text area'),
            button('modeNewImage', '/isImg/isAreaChoice.png', 'Insert new image area'),
            button('modeText', '/isImg/isSchar.png', 'Text mode'),
            button('modePencil', '/isImg/isPencilGrey.png', 'Pencil mode')
        ];
        for (let button of this.buttons) {
            this.barDiv.append(button);
            button.addEventListener('click', this.boundClickHandler);
        };
        
        // Returns a button of type img, ready to be inserted in the modebar div
        function button(id, src, title) {
            let img = document.createElement('img');
            img.id = id;
            img.src = src;
            img.title = title;
            img.className = 'iplIcon';
            return img;
        }
    }
    setMode(mode) {
        for (let button of this.buttons) {
            if (button.id == mode) {
                button.style['background-color'] = '#ffcccc';
            } else {
                button.style['background-color'] = '#ffffff';
            }
        }
        // Inform IplEditor of the click. The main work is done therwe
        this.iplEditor.modebarClicked(mode);
    }
    clickHandler(event) {
        this.setMode(event.target.id);
    }
    boundClickHandler = this.clickHandler.bind(this);
}
/**
 * An Area is a rectangular space in the workspace. It has a fixed upper left corner and fixed width,
 * but no height. Height is adapted to the actual situation, i.e. the amount of text or the aspect ratio of an image.
 * Objects of class Area have a property 'area', which is a div, acting as a positioned container.
 * 'area' div's are containers for an editor div or an image
 * TextAreas hold in their area div another div, that will be substituted by an inline ckeditor
 * ImageAreas hold an image in their area div
 * 
 * Properties
 * ==========
 *      - iplEditor: the instance of the class IplEditor, of which the area is part
 */
class Area {
    /**
     * 
     * @param {object} parent the iplEditor object, that created an instance of Area.
     * @param {number} top 
     * @param {number} left 
     * @param {number} width 
     * @param {number} height optional, not used by textArea but used by ImageArea
     */
    constructor(parent, top, left, width, height) {  
        this.iplEditor = parent;      
        this.area = document.createElement('div');
        this.area.className = 'iplArea';
        this.area.id = 'iplArea' + this.iplEditor.areas.length;
        this.area.style.top = top + 'px';
        this.area.style.left = left + 'px';
        this.area.style.width = width + 'px';
        if (height) {
            this.area.style.height = height + 'px';
        }
        this.setBorderColor(textAreaBorderColor);
    }
    /**
     * Returns a rectangle for the text area in workspace coordinates.
     * Workspace coordinates refer to the outer bounds of the workspace.
     * A rectangle has properties 'top', 'left', 'height', 'width'.
     * 
     * @returns rectangle
     */
    rectangle() {
        let style = getComputedStyle(this.iplEditor.workspace);
        let topBorder = parseInt(style['border-top-width']); 
        let leftBorder = parseInt(style['border-left-width']);
        return {
            top: this.area.offsetTop + topBorder,
            left: this.area.offsetLeft + leftBorder,
            height: this.area.offsetHeight,
            width: this.area.offsetWidth
        }
    }
    moveBy(dx, dy) {
        let style = getComputedStyle(this.area);
        let top = parseInt(style.top) + dy;
        let left = parseInt(style.left) + dx;
        this.area.style.top = top + 'px';
        this.area.style.left = left + 'px';
    }
    resizeRight(dx) {        
        let style = getComputedStyle(this.area);
        let width = parseInt(style.width) + dx;
        this.area.style.width = width + 'px';
    }
    resizeLeft(dx) {        
        let style = getComputedStyle(this.area);
        let left = parseInt(style.left) + dx;
        let width = parseInt(style.width) - dx;
        this.area.style.left = left + 'px';
        this.area.style.width = width + 'px';
    }
    /**
     * Sets the border color. 
     * The border is present in any case, but can be set to 'transparent', setting borderType 'noBorder'
     * borderType 'selectedBorder' sets the color to the module constant selectedAreaBorderColor
     * border Type 'defaultBorder' sets the border color depending on area type to textAreaBorderColor or imageAreaBorderColor
     * 
     * @param {string} color one of 'noBorder', 'selectedBorder', 'defaultBorder'
     */
    setBorderColor(borderType) {
        switch (borderType) {
            case 'noBorder':
                this.area.style.borderColor = 'transparent';
                break;
            case 'selectedBorder':
                this.area.style.borderColor = selectedAreaBorderColor;
                break;
            case 'defaultBorder':
                if (this instanceof TextArea) {                    
                    this.area.style.borderColor = textAreaBorderColor;
                } else if (this instanceof ImageArea) {                   
                    this.area.style.borderColor = imageAreaBorderColor;
                }
        }
    }
    /**
     * Returns true if and only if part of the area is visible within the workspace 1.e. is not completely scrolled out
     * 
     * @returns bool
     */
    checkVisible() {
        let areaStyle = getComputedStyle(this.area);
        let areaTop = parseInt(areaStyle.top);
        let areaHeight = parseInt(areaStyle.height);
        let workspace = this.iplEditor.workspace;
        let workspaceStyle = getComputedStyle(workspace);
        let workspaceHeight = parseInt(workspaceStyle.height);
        console.log('workspace.scrollTop=' + workspace.scrollTop);
        if (areaTop - workspace.scrollTop > workspaceHeight) {
            // console.log('Below lower border ');
            return false; // Top below lower border
        }
        if (areaTop + areaHeight - workspace.scrollTop < 0) {
            // console.log('Above upper border ');
            return false; // bottom above upper border
        }
        return true;
    }
    /**
     * Returns a classification of the position of point (x,y) inside the text area
     * 
     * @param {number} x 
     * @param {number} y 
     * @returns one of the strings 'top', 'bottom', 'left', 'right', 'inside', 'ouside' 
     */
    location(x, y) {
        // location below is a declared function, not a self reference
        return location(this.rectangle(), areaLocationTolerance, x, y);
    }
}
/**
 * A TextArea is an Area containing an inline ckEditor
 * The container div is accessible as property 'area', 
 * the editor object as property 'editorInstance' of the returned object.
 * 
 * Properties
 * ==========
 *      - editorDiv: the HTML div holding the ckeditor
 *      - editorInstance: an instance of the inline ckeditor
 *      - visible: the text area is visible in the workspace
 */
class TextArea extends Area {
    constructor(parent, top, left, width) {
        super(parent, top, left, width);
        // Add the editor. 'editor' is the div, that will be replaced by a ckEditor inline editor 
        this.editorDiv = document.createElement('div');
        this.editorDiv.id = 'iplAreaEditor' + parent.areas.length;
        this.area.append(this.editorDiv);
    }
    /**
     * NOTE This is only a promise to initiate a text area
     * ===================================================
     * The class InlineEditor supplied by the ck-editor import has a function create, which returns a promise
     * to create an inline ck-editor in the div supplied as parameter to create.
     * init calls this promise and waits for it to settle. So after a call to init(), we are shure the editor exists
     * and can be referenced by this.editorInstance in a TextArea object.
     */
    async init() {
        try {
            // this.editorInstance = await InlineEditor.create(this.editorDiv);
            this.editorInstance = await InlineEditor.create(this.editorDiv);
            this.setStickyPosition();
            if (this.checkVisible()) {
                this.visible = true;
            } else {
                this.visible = false;
            }
            this.setReadOnly(true);
        } catch(err) {
            alert(err);
        }
    }
    /**
     * Disables/Enables the ck-editor attatched to this area
     * Is used in class IplEditor to disable/enable all ck-editors
     * 
     * @param {bool} yes 
     */
    setReadOnly(yes) {
        this.editorInstance.isReadOnly = yes;
    }
    /**
     * Disables a text area, if it has exited the workspace, enables it if it has entered the workspace
     */
    setVisibility() {
        if (this.checkVisible()) {
            // The text area shows up in the workspace
            // If it was disabled, enable it.
            if (!this.visible) {
                this.setReadOnly(false);
                this.visible = true;
            }
        } else {
            // The text area does not show up in the workspace
            // If it was enabled, disable it
            if (this.visible) {
                this.setReadOnly(true);
                this.visible = false;
            }
        }
    }
    /**
     * Sets the position above which the baloon panel of editor areas cannot raise.
     * It is the top of the work area.
     * Note that the sticky position must change if the whole content is scrolled
     */
    setStickyPosition() {        
        let boundingRect = this.iplEditor.workspace.getBoundingClientRect();
        this.editorInstance.ui.viewportOffset = {
            top: boundingRect.top
        }
    }
}
class ImageArea extends Area {    
    constructor(parent, top, left, width, height) {
        super(parent, top, left, width, height);
    }
}
/**
 * Returns the position of the mouse relative to 'baseElement'
 * Takes into account, document scrolling and scrolling of the base elemet itself 
 * (e.g. iplEditor.workspace) inside the document.
 * 
 * @param {object} baseElement
 * @param {object} event 
 * @returns 
 */
function elementMousePos(baseElement, event) {
    let boundingRect = baseElement.getBoundingClientRect();
    let pos = {
        x: event.clientX - boundingRect.x + baseElement.scrollLeft,
        y: event.clientY - boundingRect.y + baseElement.scrollTop
    }
    return pos;
}
/**
 * 'rectangle' is an object with properties 'top', 'left', 'height', 'width' in an arbitrary coordinate system.
 * 'x' and 'y' denote a position in the same coordinate system
 * location(...) returns one of the strings 'top', 'bottom', 'left', 'right', 'inside', 'ouside' depending
 * on the position of (x, y) with respect to 'rectangle'.
 * 'tolerance' is the unsharpness of the position.
 * NOTE: in the corners, 'left' and 'right' take precedence over 'top' and 'bottom'.
 * 
 * @param {object} rectangle 
 * @param {number} tolerance 
 * @param {number} x 
 * @param {number} y 
 * @returns 
 */
function location(rectangle, tolerance, x, y) {
    if (x > rectangle.left - tolerance && x < rectangle.left + rectangle.width + tolerance) {
        // We are inside a vertical stripe enclosing the rectangle + tolerance
        if (y > rectangle.top - tolerance && y < rectangle.top + rectangle.height + tolerance) {
            // We are inside a rectanle englobing the rectanle + tolerance
            if (x < rectangle.left + tolerance) {
                return 'left';
            }
            if (x > rectangle.left + rectangle.width - tolerance) {
                return 'right'
            }
            if (y < rectangle.top + tolerance) {
                return 'top';
            }
            if (y > rectangle.top + rectangle.height - tolerance) {
                return 'bottom';
            }
            return 'inside';
        } else {
            return 'outside';
        }
    } else {
        return 'outside';
    }
}
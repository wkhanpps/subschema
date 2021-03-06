"use strict";

import React, {Component} from 'react';
import Editor from '../components/Editor';
import Constants from '../Constants';
import ValueManager from '../ValueManager';
import NewChildContext from '../components/NewChildContext.jsx';
import tu, {isString, path,clone, returnFirst, FREEZE_ARR, FREEZE_OBJ} from '../tutils';
import ObjectType from './Object.jsx';
import PropTypes from '../PropTypes';
import map from 'lodash/collection/map';
import style from 'subschema-styles/CollectionMixin-style';
import listen from '../decorators/listen';
import template from '../decorators/template';
function makeEditPid(path, pid) {
    return '@' + path.replace(/\./g, '@') + (pid != null ? `@${pid}` : '');
}
function wrapFunc(value, key) {
    return {value, key}
}
function remove(obj, key) {
    if (!obj) return;
    if (Array.isArray(obj)) {
        obj.splice(key, 1);

    } else {
        delete obj[key];
    }
    return obj;
}

export default class CollectionMixin extends Component {


    static inputClassName = Constants.listClassName;

    static contextTypes = PropTypes.contextTypes;

    static propTypes = {
        onChange: PropTypes.valueEvent,
        path: PropTypes.path,
        canEdit: PropTypes.bool,
        canReorder: PropTypes.bool,
        canDelete: PropTypes.bool,
        canAdd: PropTypes.bool,
        showKey: PropTypes.bool,
        inline: PropTypes.bool,
        labelKey: PropTypes.path,
        itemType: PropTypes.schema,
        createTemplate: PropTypes.template,
        buttonTemplate: PropTypes.template,
        itemTemplate: PropTypes.template,
        contentTemplate: PropTypes.template

    };

    static defaultProps = {
        createTemplate: 'CollectionCreateTemplate',
        buttonTemplate: 'ButtonTemplate',
        itemTemplate: 'ListItemTemplate',
        contentTemplate: "ContentItemTemplate",
        showKey: false
    };

    constructor(props, ...rest) {
        super(props, ...rest);
        var state = this.state || (this.state = {});
        state.wrapped = map(props.value, wrapFunc);
    }

    componentWillReceiveProps(props) {
        this.setValue(props.value);
    }

    getValue() {
        return this.unwrap(this.state.wrapped);
    }

    setValue(value) {
        this.setState({wrapped: map(value, wrapFunc)});
    }

    setErrors(errors) {
        this.setState({errors});
    }

    handleMoveUp = (pos, val) => {
        var values = this.state.wrapped, oval = values && values.concat();
        values.splice(Math.max(pos - 1, 0), 0, values.splice(pos, 1)[0]);
        this.changeValue(values, oval);
    }

    handleMoveDown = (pos, val)=> {
        var values = this.state.wrapped, oval = values && values.concat();
        values.splice(Math.min(pos + 1, values.length), 0, values.splice(pos, 1)[0]);
        this.changeValue(values, oval);

    }

    handleDelete = (pos, val, pid)=> {
        var values = this.state.wrapped, oval = values && values.concat();
        values.splice(pos, 1);
        this.changeValue(values, oval);
    }


    changeValue = (newValue, oldValue)=> {
        if (this.props.onChange(this.unwrap(newValue)) !== false) {

            this.setState({
                wrapped: newValue,
                showAdd: false,
                showEdit: false
            });
        }
    }

    handleAddBtn = (e) => {
        e && e.preventDefault();
        var editPid = this.createPid()
        this.context.valueManager.update(makeEditPid(this.props.path, editPid), {
            key: editPid
        });
        this.setState({showAdd: true, editPid});
    }

    handleEdit = (pos, val, pid) => {
        this.context.valueManager.update(makeEditPid(this.props.path, pid), {
            value: clone(val),
            key: pid
        });
        this.setState({
            showAdd: false,
            showEdit: true,
            editPid: pid
        });
    }


    handleCancelAdd = (e) => {
        e && e.preventDefault();
        this.setState({showAdd: false, showEdit: false});
    }

    handleBtnClick = (e, action)=> {
        e && e.preventDefault();

        if (action == 'submit') {
            this.handleSubmit(e);
        } else {
            this.context.valueManager.update(makeEditPid(this.props.path, this.state.editPid));
            this.setState({
                showAdd: false,
                showEdit: false,
                editPid: null
            });
        }
    }

    handleSubmit = (e)=> {
        e && e.preventDefault();
        var {valueManager} = this.context;
        var origKey = makeEditPid(this.props.path, this.state.editPid);
        var {
            key,
            value
            } = valueManager.path(origKey), errors = valueManager.getErrors();

        if (errors == null || Object.keys(errors).length === 0) {
            var currentPath = path(this.props.path, key);
            var clonedValue = this.props.value == null ? this.createDefValue() : clone(this.props.value);
            if (!this.props.onSubmit || this.props.onSubmit(e, errors, value, currentPath) !== false) {
                clonedValue[key] = value;
                //if the key changed, remove the original.
                if (origKey !== makeEditPid(currentPath)) {
                    remove(clonedValue, this.state.editPid);
                }
                valueManager.update(origKey);
                this.props.onChange(clonedValue);
            }

            //return false;
        } else {
            return false;
        }

        this.setState({
            showAdd: false,
            showEdit: false,
            editPid: null
        });
    }


    renderAddEditTemplate(edit, create) {
        var label = '';
        if (edit) {
            label = 'Save';
        } else if (create) {
            label = 'Create';
        } else {
            return null;
        }
        var title = this.props.title || '';
        var childPath = path(this.props.path, this.state.editPid);
        return <ObjectType key="addEdit" objectTemplate={this.props.createTemplate}
                           onButtonClick={this.handleBtnClick}
                           schema={this.createItemSchema(childPath)}
                           path={makeEditPid(this.props.path,this.state.editPid)}
                           title={this.props.inline && edit ? false : create ? 'Create ' + title : 'Edit ' + title  }

        />
    }

    renderAddBtn() {
        if (!this.props.canAdd) {
            return null;
        }
        var Template = this.props.buttonTemplate;
        return <Template ref="addBtn" key="addBtn" buttonClass={style.addBtn} label="Add"
                         onClick={this.handleAddBtn}><i className={style.iconAdd}/>
        </Template>

    }

    renderAdd() {
        if (!(this.props.canAdd || this.props.canEdit)) {
            return null;
        }
        var {showAdd, showEdit} = this.state;
        return showAdd || showEdit ?
            showAdd || showEdit && !this.props.inline ? this.renderAddEditTemplate(showEdit, showAdd) : null
            : this.renderAddBtn();
    }

    createItemSchema() {
        return {
            schema: this.getTemplateItem(),
            fieldsets: [{
                fields: ['key', 'value'],
                buttons: {
                    buttonsClass: 'btn-group pull-right',
                    buttons: [{label: 'Cancel', action: 'cancel', buttonClass: 'btn btn-default'}
                        , {label: 'Save', type: 'submit', action: 'submit', buttonClass: 'btn-primary btn'}]
                }
            }]

        }
    }

    renderRowEach(data, rowId) {
        return this.renderRow(data, null, rowId);
    }

    renderRow(v, sectionId, i) {
        var ItemTemplate = this.props.itemTemplate, ContentItemTemplate = this.props.contentTemplate;

        return <ItemTemplate key={this.props.path+'.'+i} pos={i} path={ path(this.props.path, v.key)}
                             onMoveUp={this.handleMoveUp}
                             onMoveDown={this.handleMoveDown}
                             onDelete={this.handleDelete}
                             onEdit={this.handleEdit}
                             canReorder={this.props.canReorder}
                             canDelete={this.props.canDelete}
                             canEdit={this.props.canEdit}
                             field={v}
                             pid={v.key}
                             value={v} errors={this.props.errors} last={i + 1 === this.state.wrapped.length}>
            {this.props.inline && this.state.editPid === v.key ? this.renderAddEditTemplate(v, false) :
            <ContentItemTemplate value={v} labelKey={this.props.labelKey} showKey={this.props.key}
                                 pos={i}
                                 pid={v.key}
                                 value={v}
                                 showKey={this.props.showKey}
                                 onClick={this.props.canEdit ? this.handleEdit : null}/> }
        </ItemTemplate>
    }

    render() {
        var {name,  itemType, errors,className, canReorder, canDelete, itemTemplate, canEdit, canAdd } = this.props, values = this.state.wrapped || EMPTY_ARR, length = values.length;
        return (<div className={className}>
            {this.renderAdd()}
            <ul>
                {values.map(this.renderRowEach, this)}
            </ul>
        </div>);
    }

}

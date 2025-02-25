import React from "react";
import PropTypes from "prop-types";
import { withStyles } from "@material-ui/core/styles";
import MuiDialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import Dialog from "@material-ui/core/Dialog";
import Grid from "@material-ui/core/Grid";
import Typography from "@material-ui/core/Typography";
import IconButton from "@material-ui/core/IconButton";
import CloseIcon from "@material-ui/icons/Close";
import DoubleArrowIcon from '@material-ui/icons/DoubleArrow';
import AppBar from "@material-ui/core/AppBar";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Box from "@material-ui/core/Box";

import { withSnackbar } from "notistack";

import axios from "axios";

import { DevMode, ADMIN_PROJECT_ID } from "./globals";
import { datastore } from "./datastore";
import Theme from "./theme";
import ContextMain from "./ContextMain";
import { showNotification, formatAuthors } from "./utils";
import ModelDetailHeader from "./ModelDetailHeader";
import ModelDetailContent from "./ModelDetailContent";
import ModelDetailMetadata from "./ModelDetailMetadata";
import ModelResultOverview from "./ModelResultOverview";
import ResultGraphs from "./ResultGraphs";
import DiscussionPanel from "./DiscussionPanel";

// if working on the appearance/layout set globals.DevMode=true
// to avoid loading the models and tests over the network every time;
// instead we use the local test_data
var result_data = {};
if (DevMode) {
    result_data = require("./dev_data/sample_model_results.json");
}

const styles = (theme) => ({
    root: {
        margin: 0,
        padding: theme.spacing(2),
    },
    closeButton: {
        position: "absolute",
        right: theme.spacing(1),
        top: theme.spacing(1),
        color: theme.palette.grey[500],
    },
    default_tabStyle: {
        backgroundColor: Theme.tableHeader,
    },
    active_tabStyle: {
        backgroundColor: Theme.activeTabColor,
    },
    default_subTabStyle: {
        backgroundColor: Theme.subTabColor,
        fontStyle: "italic",
        opacity: 1.0
    }
});

function TabPanel(props) {
    const { children, value, index, ...other } = props;

    return (
        <Typography
            component="div"
            role="tabpanel"
            hidden={value !== index}
            id={`simple-tabpanel-${index}`}
            aria-labelledby={`simple-tab-${index}`}
            {...other}
        >
            {value === index && <Box p={3}>{children}</Box>}
        </Typography>
    );
}

TabPanel.propTypes = {
    children: PropTypes.node,
    index: PropTypes.any.isRequired,
    value: PropTypes.any.isRequired,
};

const MyDialogTitle = withStyles(styles)((props) => {
    const { children, classes, onClose, ...other } = props;
    return (
        <MuiDialogTitle disableTypography className={classes.root} {...other}>
            <Typography variant="h6">{children}</Typography>
            {onClose ? (
                <IconButton
                    aria-label="close"
                    className={classes.closeButton}
                    onClick={onClose}
                >
                    <CloseIcon />
                </IconButton>
            ) : null}
        </MuiDialogTitle>
    );
});

class ModelDetail extends React.Component {
    signal = axios.CancelToken.source();
    static contextType = ContextMain;

    constructor(props, context) {
        super(props, context);
        const [authContext] = this.context.auth;

        this.state = {
            tabValue: 0,
            results: null,
            loadingResult: true,
            loadingExtended: true,
            error: null,
            auth: authContext,
            canEdit: false,
            compareFlag: null,
        };
        if (DevMode) {
            this.state["results"] = result_data.results;
            this.state["loadingResult"] = false;
            this.state["loadingExtended"] = false;
        }
        this.updateCurrentModelData = this.updateCurrentModelData.bind(this);
        this.checkCompareStatus = this.checkCompareStatus.bind(this);
        this.addModelCompare = this.addModelCompare.bind(this);
        this.removeModelCompare = this.removeModelCompare.bind(this);
        this.addModelInstanceCompare = this.addModelInstanceCompare.bind(this);
        this.removeModelInstanceCompare =
            this.removeModelInstanceCompare.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleTabChange = this.handleTabChange.bind(this);
        this.checkEditAccess = this.checkEditAccess.bind(this);
        this.getExtendedData = this.getExtendedData.bind(this);
    }

    componentDidMount() {
        if (!DevMode) {
            this.getExtendedData();
            this.getModelResults();
            this.checkEditAccess(this.context.status);
        }
    }

    componentWillUnmount() {
        this.signal.cancel("REST API call canceled!");
    }

    updateCurrentModelData(updatedModelData) {
        this.props.updateCurrentModelData(updatedModelData);
    }

    checkCompareStatus(modelData) {
        // required since model could have been added to compare via table listing
        let [compareModels] = this.context.compareModels;
        // check if model exists in compare
        if (!(modelData.id in compareModels)) {
            return false;
        }
        let model_inst_ids = modelData.instances.map((item) => item.id).sort();
        let compare_model_inst_ids = Object.keys(
            compareModels[modelData.id].selected_instances
        ).sort();
        // check if all the model instances already added to compare

        if (model_inst_ids.toString() === compare_model_inst_ids.toString()) {
            return true;
        } else {
            return false;
        }
    }

    addModelCompare() {
        console.log("Add item to compare.");
        let [compareModels, setCompareModels] = this.context.compareModels;

        let model = this.props.modelData;
        // check if model already added to compare
        if (!(model.id in compareModels)) {
            compareModels[model.id] = {
                name: model.name,
                alias: model.alias,
                selected_instances: {},
            };
        }
        // loop through every instance of this model
        for (let model_inst of model.instances) {
            // check if model instance already added to compare
            if (
                !(model_inst.id in compareModels[model.id].selected_instances)
            ) {
                compareModels[model.id].selected_instances[model_inst.id] = {
                    version: model_inst.version,
                    timestamp: model_inst.timestamp,
                };
            }
        }

        setCompareModels(compareModels);
        this.setState({ compareFlag: true });
        showNotification(
            this.props.enqueueSnackbar,
            this.props.closeSnackbar,
            "Model added to compare!",
            "info"
        );
    }

    removeModelCompare() {
        console.log("Remove item from compare.");
        let [compareModels, setCompareModels] = this.context.compareModels;

        let model = this.props.modelData;
        // remove if model exists for compare
        if (model.id in compareModels) {
            delete compareModels[model.id];
        }

        setCompareModels(compareModels);
        this.setState({ compareFlag: false });
        showNotification(
            this.props.enqueueSnackbar,
            this.props.closeSnackbar,
            "Model removed from compare!",
            "info"
        );
    }

    addModelInstanceCompare(model_inst_id) {
        console.log("Add instance to compare.");
        let [compareModels, setCompareModels] = this.context.compareModels;

        let model = this.props.modelData;
        // check if model already added to compare
        if (!(model.id in compareModels)) {
            compareModels[model.id] = {
                name: model.name,
                alias: model.alias,
                selected_instances: {},
            };
        }
        // add model instance to compare
        let model_inst = model.instances.find(
            (item) => item.id === model_inst_id
        );
        // check if model instance already added to compare
        if (!(model_inst_id in compareModels[model.id].selected_instances)) {
            compareModels[model.id].selected_instances[model_inst_id] = {
                version: model_inst.version,
                timestamp: model_inst.timestamp,
            };
        }
        // check if all model instances are now in compare
        this.setState({ compareFlag: this.checkCompareStatus(model) });

        setCompareModels(compareModels);
        showNotification(
            this.props.enqueueSnackbar,
            this.props.closeSnackbar,
            "Model instance added to compare!",
            "info"
        );
    }

    removeModelInstanceCompare(model_inst_id) {
        console.log("Remove instance from compare.");
        let [compareModels, setCompareModels] = this.context.compareModels;

        let model = this.props.modelData;
        if (model.id in compareModels) {
            if (model_inst_id in compareModels[model.id].selected_instances) {
                delete compareModels[model.id].selected_instances[
                    model_inst_id
                ];
            }
        }
        // remove model if it does not contain any other instances for compare
        if (
            Object.keys(compareModels[model.id].selected_instances).length === 0
        ) {
            delete compareModels[model.id];
            this.setState({ compareFlag: false });
        }

        setCompareModels(compareModels);
        this.forceUpdate();
        showNotification(
            this.props.enqueueSnackbar,
            this.props.closeSnackbar,
            "Model instance removed from compare!",
            "info"
        );
    }

    handleClose() {
        this.props.onClose();
    }

    handleTabChange(event, newValue) {
        // 0 : Model Info
        // 1 : Discussion
        // 2 : Validations
        // 3 : Validations -> Results
        // 4 : Validations -> Figures
        if (newValue === 2) {
            newValue = 3
        }
        this.setState({ tabValue: newValue });
    }

    getExtendedData() {
        return datastore
            .getModel(this.props.modelData.id, this.signal)
            .then((model) => {
                this.props.updateCurrentModelData(model);
                this.setState({
                    loadingExtended: false,
                    error: null,
                    compareFlag:
                        model.instances.length === 0
                            ? null
                            : this.checkCompareStatus(model),
                });
            })
            .catch((err) => {
                if (axios.isCancel(err)) {
                    console.log("Error: ", err.message);
                } else {
                    // Something went wrong. Save the error in state and re-render.
                    this.setState({
                        loadingExtended: false,
                        error: err,
                    });
                }
            });
    }

    getModelResults() {
        return datastore
            .getResultsByModel(this.props.modelData.id)
            .then((results) => {
                this.setState({
                    results: results,
                    loadingResult: false,
                    error: null,
                });
            })
            .catch((err) => {
                if (axios.isCancel(err)) {
                    console.log("Error: ", err.message);
                } else {
                    // Something went wrong. Save the error in state and re-render.
                    this.setState({
                        loadingResult: false,
                        error: err,
                    });
                }
            });
    }

    checkEditAccess(status) {
        const [statusMessage] = status;
        if (statusMessage.includes("read-only")) {
            return
        }
        let model = this.props.modelData;
        console.log("Checking edit access");
        datastore
            .getProjects()
            .then((projects) => {
                projects.forEach((projectID) => {
                    if (
                        projectID === model.project_id ||
                        projectID === ADMIN_PROJECT_ID
                    ) {
                        this.setState({
                            canEdit: true,
                        });
                    }
                });
            })
            .catch((err) => {
                console.log("Error: ", err.message);
            });
    }

    render() {
        const { classes } = this.props;
        const emptyMessage = ("No-one has commented on this model yet. " +
            "Do you have any thoughts about the model or any of its implementations? " +
            "If so, please comment!")

        return (
            <Dialog
                fullScreen
                onClose={this.handleClose}
                aria-labelledby="simple-dialog-title"
                open={this.props.open}
            >
                <MyDialogTitle onClose={this.handleClose} />
                <DialogContent>
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <ModelDetailHeader
                                name={this.props.modelData.name}
                                authors={formatAuthors(
                                    this.props.modelData.author
                                )}
                                private={this.props.modelData.private}
                                id={this.props.modelData.id}
                                alias={this.props.modelData.alias}
                                dateCreated={this.props.modelData.date_created}
                                owner={formatAuthors(
                                    this.props.modelData.owner
                                )}
                                modelData={this.props.modelData}
                                canEdit={this.state.canEdit}
                                updateCurrentModelData={
                                    this.updateCurrentModelData
                                }
                                compareFlag={this.state.compareFlag}
                                addModelCompare={this.addModelCompare}
                                removeModelCompare={this.removeModelCompare}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <AppBar position="static">
                                <Tabs
                                    value={this.state.tabValue}
                                    onChange={this.handleTabChange}
                                    style={{
                                        backgroundColor:
                                            Theme.pageDetailBarColor,
                                        color: Theme.textPrimary,
                                    }}
                                >
                                    <Tab label="Info" className={this.state.tabValue === 0 ? classes.active_tabStyle : classes.default_tabStyle}
                                        style={{ opacity: 1 }} />

                                    <Tab label="Discussion" className={this.state.tabValue === 1 ? classes.active_tabStyle : classes.default_tabStyle}
                                        style={{ opacity: 1 }} />


                                    <Tab label={this.state.tabValue >= 2
                                        ? <div>Validations<DoubleArrowIcon style={{ verticalAlign: 'bottom', opacity: 1 }} /></div>
                                        : "Validations"}
                                        className={this.state.tabValue >= 2 ? classes.active_tabStyle : classes.default_tabStyle} />

                                    {this.state.tabValue >= 2 && <Tab label="Results" className={classes.default_subTabStyle}
                                        style={{
                                            borderTop: "medium solid", borderTopColor: Theme.activeTabColor,
                                            borderBottom: "medium solid", borderBottomColor: Theme.activeTabColor
                                        }} />}

                                    {this.state.tabValue >= 2 && <Tab label="Figures" className={classes.default_subTabStyle}
                                        style={{
                                            borderTop: "medium solid", borderTopColor: Theme.activeTabColor,
                                            borderBottom: "medium solid", borderBottomColor: Theme.activeTabColor
                                        }} />}
                                </Tabs>
                            </AppBar>

                            <TabPanel value={this.state.tabValue} index={0}>
                                <Grid container spacing={3}>
                                    <Grid item xs={9}>
                                        <ModelDetailContent
                                            description={
                                                this.props.modelData.description
                                            }
                                            instances={
                                                this.props.modelData.instances
                                            }
                                            id={this.props.modelData.id}
                                            modelScope={
                                                this.props.modelData.model_scope
                                            }
                                            canEdit={this.state.canEdit}
                                            results={this.state.results}
                                            loading={this.state.loadingExtended}
                                            addModelInstanceCompare={
                                                this.addModelInstanceCompare
                                            }
                                            removeModelInstanceCompare={
                                                this.removeModelInstanceCompare
                                            }
                                        />
                                    </Grid>
                                    <Grid item xs={3}>
                                        <ModelDetailMetadata
                                            species={
                                                this.props.modelData.species
                                            }
                                            brainRegion={
                                                this.props.modelData
                                                    .brain_region
                                            }
                                            cellType={
                                                this.props.modelData.cell_type
                                            }
                                            modelScope={
                                                this.props.modelData.model_scope
                                            }
                                            abstractionLevel={
                                                this.props.modelData
                                                    .abstraction_level
                                            }
                                            projectID={
                                                this.props.modelData.private ? this.props.modelData.project_id : null
                                            }
                                            organization={
                                                this.props.modelData
                                                    .organization
                                            }
                                        />
                                    </Grid>
                                </Grid>
                            </TabPanel>
                            <TabPanel value={this.state.tabValue} index={1}>
                                <DiscussionPanel
                                    id={this.props.modelData.id}
                                    emptyMessage={emptyMessage}
                                />
                            </TabPanel>
                            <TabPanel value={this.state.tabValue} index={2}>
                            </TabPanel>
                            <TabPanel value={this.state.tabValue} index={3}>
                                <ModelResultOverview
                                    id={this.props.modelData.id}
                                    modelJSON={this.props.modelData}
                                    results={this.state.results}
                                    loadingResult={this.state.loadingResult}
                                />
                            </TabPanel>
                            <TabPanel value={this.state.tabValue} index={4}>
                                <ResultGraphs
                                    id={this.props.modelData.id}
                                    results={this.state.results}
                                    loadingResult={this.state.loadingResult}
                                />
                            </TabPanel>
                        </Grid>
                    </Grid>
                </DialogContent>
            </Dialog>
        );
    }
}

ModelDetail.propTypes = {
    onClose: PropTypes.func.isRequired,
    open: PropTypes.bool.isRequired,
};

export default withSnackbar(withStyles(styles)(ModelDetail));

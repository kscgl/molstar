import { ANVILMembraneOrientation } from '../../extensions/anvil/behavior';
import { CellPack } from '../../extensions/cellpack';
import { DnatcoNtCs } from '../../extensions/dnatco';
import { G3DFormat, G3dProvider } from '../../extensions/g3d/format';
import { GeometryExport } from '../../extensions/geo-export';
import { MAQualityAssessment } from '../../extensions/model-archive/quality-assessment/behavior';
import { QualityAssessmentPLDDTPreset, QualityAssessmentQmeanPreset } from '../../extensions/model-archive/quality-assessment/behavior';
import { QualityAssessment } from '../../extensions/model-archive/quality-assessment/prop';
import { ModelExport } from '../../extensions/model-export';
import { Mp4Export } from '../../extensions/mp4-export';
import { PDBeStructureQualityReport } from '../../extensions/pdbe';
import { RCSBAssemblySymmetry, RCSBValidationReport } from '../../extensions/rcsb';
import { ZenodoImport } from '../../extensions/zenodo';
import { DownloadStructure } from '../../mol-plugin-state/actions/structure';
import { PresetTrajectoryHierarchy } from '../../mol-plugin-state/builder/structure/hierarchy-preset';
import { PresetStructureRepresentations, StructureRepresentationPresetProvider } from '../../mol-plugin-state/builder/structure/representation-preset';
import { DataFormatProvider } from '../../mol-plugin-state/formats/provider';
import { BuiltInTopologyFormat } from '../../mol-plugin-state/formats/topology';
import { BuiltInCoordinatesFormat } from '../../mol-plugin-state/formats/coordinates';
import { BuiltInTrajectoryFormat } from '../../mol-plugin-state/formats/trajectory';
import { createPluginUI } from '../../mol-plugin-ui/react18';
import { PluginUIContext } from '../../mol-plugin-ui/context';
import { DefaultPluginUISpec, PluginUISpec } from '../../mol-plugin-ui/spec';
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginConfig } from '../../mol-plugin/config';
import { PluginLayoutControlsDisplay } from '../../mol-plugin/layout';
import { PluginSpec } from '../../mol-plugin/spec';
import { StateObjectRef } from '../../mol-state';
import { Asset } from '../../mol-util/assets';
import { Color } from '../../mol-util/color';
import '../../mol-util/polyfill';
import { ObjectKeys } from '../../mol-util/type-helpers';
import { SaccharideCompIdMapType } from '../../mol-model/structure/structure/carbohydrates/constants';
import { Backgrounds } from '../../extensions/backgrounds';
import { Canvas3DProps } from '../../mol-canvas3d/canvas3d';
import { DefaultColorSwatch } from '../../mol-util/color/swatches';
import { featureDataString } from './sars2-features';
import { SetUtils } from '../../mol-util/set';
import { AminoAcidNamesL, DnaBaseNames, RnaBaseNames, WaterNames } from '../../mol-model/structure/model/types';
import { Script } from '../../mol-script/script';
import { Structure } from '../../mol-model/structure/structure/structure';
import { StructureSelection } from '../../mol-model/structure/query/selection';
import { StructureElement } from '../../mol-model/structure/structure/element';
import { Overpaint } from '../../mol-theme/overpaint';
import { StateTransforms } from '../../mol-plugin-state/transforms';
import { Loci } from '../../mol-model/loci';

export { PLUGIN_VERSION as version } from '../../mol-plugin/version';
export { setDebugMode, setProductionMode, setTimingMode } from '../../mol-util/debug';

type LoadParams = { url: string, format?: BuiltInTrajectoryFormat, isBinary?: boolean, assemblyId?: string, selection?: string, displaySpikeSequence?: boolean, label?: string }
type OverPaintData = { seq: string, color: number };
type _Preset = Pick<Canvas3DProps, 'postprocessing' | 'renderer'>
type Preset = { [K in keyof _Preset]: Partial<_Preset[K]> }

const CustomFormats = [
    ['g3d', G3dProvider] as const
];

const Canvas3DPresets = {
    illustrative: {
        canvas3d: <Preset>{
            postprocessing: {
                occlusion: { name: 'on', params: { samples: 32, radius: 6, bias: 1.4, blurKernelSize: 15, resolutionScale: 1 } },
                /* outline: { name: 'on', params: { scale: 1, threshold: 0.33, color: Color(0x000000) } }*/
            },
            renderer: {
                ambientIntensity: 1.0,
                light: []
            }
        }
    },
    occlusion: {
        canvas3d: <Preset>{
            postprocessing: {
                occlusion: { name: 'on', params: { samples: 32, radius: 6, bias: 1.4, blurKernelSize: 15, resolutionScale: 1 } },
                outline: { name: 'off', params: {} }
            },
            renderer: {
                ambientIntensity: 0.4,
                light: [{ inclination: 180, azimuth: 0, color: Color.fromNormalizedRgb(1.0, 1.0, 1.0),
                    intensity: 0.6 }]
            }
        }
    },
    standard: {
        canvas3d: <Preset>{
            postprocessing: {
                occlusion: { name: 'off', params: {} },
                outline: { name: 'off', params: {} }
            },
            renderer: {
                ambientIntensity: 0.4,
                light: [{ inclination: 180, azimuth: 0, color: Color.fromNormalizedRgb(1.0, 1.0, 1.0),
                    intensity: 0.6 }]
            }
        }
    }
};

const Extensions = {
    'backgrounds': PluginSpec.Behavior(Backgrounds),
    'cellpack': PluginSpec.Behavior(CellPack),
    'dnatco-ntcs': PluginSpec.Behavior(DnatcoNtCs),
    'pdbe-structure-quality-report': PluginSpec.Behavior(PDBeStructureQualityReport),
    'rcsb-assembly-symmetry': PluginSpec.Behavior(RCSBAssemblySymmetry),
    'rcsb-validation-report': PluginSpec.Behavior(RCSBValidationReport),
    'anvil-membrane-orientation': PluginSpec.Behavior(ANVILMembraneOrientation),
    'g3d': PluginSpec.Behavior(G3DFormat),
    'model-export': PluginSpec.Behavior(ModelExport),
    'mp4-export': PluginSpec.Behavior(Mp4Export),
    'geo-export': PluginSpec.Behavior(GeometryExport),
    'ma-quality-assessment': PluginSpec.Behavior(MAQualityAssessment),
    'zenodo-import': PluginSpec.Behavior(ZenodoImport),
};

const DefaultViewerOptions = {
    customFormats: CustomFormats as [string, DataFormatProvider][],
    extensions: ObjectKeys(Extensions),
    layoutIsExpanded: true,
    layoutShowControls: true,
    layoutShowRemoteState: false,
    layoutControlsDisplay: 'reactive' as PluginLayoutControlsDisplay,
    layoutShowSequence: true,
    layoutShowLog: true,
    layoutShowLeftPanel: true,
    hideLeftPanel: true,
    collapseLeftPanel: true,
    collapseRightPanel: false,
    disableAntialiasing: PluginConfig.General.DisableAntialiasing.defaultValue,
    pixelScale: PluginConfig.General.PixelScale.defaultValue,
    pickScale: PluginConfig.General.PickScale.defaultValue,
    pickPadding: PluginConfig.General.PickPadding.defaultValue,
    enableWboit: PluginConfig.General.EnableWboit.defaultValue,
    enableDpoit: PluginConfig.General.EnableDpoit.defaultValue,
    preferWebgl1: PluginConfig.General.PreferWebGl1.defaultValue,
    allowMajorPerformanceCaveat: PluginConfig.General.AllowMajorPerformanceCaveat.defaultValue,

    viewportShowExpand: PluginConfig.Viewport.ShowExpand.defaultValue,
    viewportShowControls: PluginConfig.Viewport.ShowControls.defaultValue,
    viewportShowSettings: PluginConfig.Viewport.ShowSettings.defaultValue,
    viewportShowSelectionMode: PluginConfig.Viewport.ShowSelectionMode.defaultValue,
    viewportShowAnimation: PluginConfig.Viewport.ShowAnimation.defaultValue,
    viewportShowTrajectoryControls: PluginConfig.Viewport.ShowTrajectoryControls.defaultValue,
    pluginStateServer: PluginConfig.State.DefaultServer.defaultValue,
    volumeStreamingServer: PluginConfig.VolumeStreaming.DefaultServer.defaultValue,
    volumeStreamingDisabled: !PluginConfig.VolumeStreaming.Enabled.defaultValue,
    pdbProvider: PluginConfig.Download.DefaultPdbProvider.defaultValue,
    emdbProvider: PluginConfig.Download.DefaultEmdbProvider.defaultValue,
    saccharideCompIdMapType: 'default' as SaccharideCompIdMapType,
};
type ViewerOptions = typeof DefaultViewerOptions;

class BVBRCMolStarWrapper {
    defaultColors = DefaultColorSwatch;
    featureData = featureDataString;

    plugin: PluginUIContext;

    async init(elementOrId: string | HTMLElement, options: Partial<ViewerOptions> = {}) {
        const definedOptions = {} as any;
        // filter for defined properies only so the default values
        // are property applied
        for (const p of Object.keys(options) as (keyof ViewerOptions)[]) {
            if (options[p] !== void 0) definedOptions[p] = options[p];
        }

        const o: ViewerOptions = { ...DefaultViewerOptions, ...definedOptions };
        const defaultSpec = DefaultPluginUISpec();

        const spec: PluginUISpec = {
            actions: defaultSpec.actions,
            behaviors: [
                ...defaultSpec.behaviors,
                ...o.extensions.map(e => Extensions[e]),
            ],
            animations: [...defaultSpec.animations || []],
            customParamEditors: defaultSpec.customParamEditors,
            customFormats: o?.customFormats,
            layout: {
                initial: {
                    isExpanded: o.layoutIsExpanded,
                    showControls: o.layoutShowControls,
                    controlsDisplay: o.layoutControlsDisplay,
                    regionState: {
                        bottom: 'full',
                        left: o.hideLeftPanel ? 'hidden' : o.collapseLeftPanel ? 'collapsed' : 'full',
                        right: o.collapseRightPanel ? 'hidden' : 'full',
                        top: 'full',
                    }
                },
            },
            components: {
                ...defaultSpec.components,
                controls: {
                    ...defaultSpec.components?.controls,
                    top: o.layoutShowSequence ? undefined : 'none',
                    bottom: o.layoutShowLog ? undefined : 'none',
                    left: o.layoutShowLeftPanel ? undefined : 'none',
                },
                remoteState: o.layoutShowRemoteState ? 'default' : 'none',
            },
            config: [
                [PluginConfig.General.DisableAntialiasing, o.disableAntialiasing],
                [PluginConfig.General.PixelScale, o.pixelScale],
                [PluginConfig.General.PickScale, o.pickScale],
                [PluginConfig.General.PickPadding, o.pickPadding],
                [PluginConfig.General.EnableWboit, o.enableWboit],
                [PluginConfig.General.EnableDpoit, o.enableDpoit],
                [PluginConfig.General.PreferWebGl1, o.preferWebgl1],
                [PluginConfig.General.AllowMajorPerformanceCaveat, o.allowMajorPerformanceCaveat],
                [PluginConfig.Viewport.ShowExpand, o.viewportShowExpand],
                [PluginConfig.Viewport.ShowControls, o.viewportShowControls],
                [PluginConfig.Viewport.ShowSettings, o.viewportShowSettings],
                [PluginConfig.Viewport.ShowSelectionMode, o.viewportShowSelectionMode],
                [PluginConfig.Viewport.ShowAnimation, o.viewportShowAnimation],
                [PluginConfig.Viewport.ShowTrajectoryControls, o.viewportShowTrajectoryControls],
                [PluginConfig.State.DefaultServer, o.pluginStateServer],
                [PluginConfig.State.CurrentServer, o.pluginStateServer],
                [PluginConfig.VolumeStreaming.DefaultServer, o.volumeStreamingServer],
                [PluginConfig.VolumeStreaming.Enabled, !o.volumeStreamingDisabled],
                [PluginConfig.Download.DefaultPdbProvider, o.pdbProvider],
                [PluginConfig.Download.DefaultEmdbProvider, o.emdbProvider],
                [PluginConfig.Structure.DefaultRepresentationPreset, ViewerAutoPreset.id],
                [PluginConfig.Structure.SaccharideCompIdMapType, o.saccharideCompIdMapType],
            ]
        };

        const element = typeof elementOrId === 'string'
            ? document.getElementById(elementOrId)
            : elementOrId;
        if (!element) throw new Error(`Could not get element with id '${elementOrId}'`);
        this.plugin = await createPluginUI(element, spec, {
            onBeforeUIRender: plugin => {
                // the preset needs to be added before the UI renders otherwise
                // "Download Structure" wont be able to pick it up
                plugin.builders.structure.representation.registerPreset(ViewerAutoPreset);
            }
        });
    }

    async load({ url, format = 'mmcif', isBinary = false, displaySpikeSequence = false, label }: LoadParams) {
        const params = DownloadStructure.createDefaultParams(this.plugin.state.data.root.obj!, this.plugin);
        await this.plugin.runTask(this.plugin.state.data.applyAction(DownloadStructure, {
            source: {
                name: 'url',
                params: {
                    url: Asset.Url(url),
                    format: format as any,
                    isBinary,
                    label: label,
                    options: { ...params.source.params.options },
                }
            }
        }));

        const props = Canvas3DPresets['occlusion'];
        await PluginCommands.Canvas3D.SetSettings(this.plugin, {
            settings: {
                ...props,
                renderer: {
                    ...this.plugin.canvas3d!.props.renderer,
                    ...props.canvas3d.renderer
                },
                postprocessing: {
                    ...this.plugin.canvas3d!.props.postprocessing,
                    ...props.canvas3d.postprocessing
                },
            }
        });

        await this.coloring.applyDefault();

        if (displaySpikeSequence) {
            const selectElements = document.getElementsByTagName('select');
            for (const selectElement of selectElements as any) {
                const title = selectElement.getAttribute('title');
                if (title && title.startsWith('[Entity]')) {
                    // Looking for spike protein option
                    // @ts-ignore
                    const spikeOption: HTMLOptionElement = Array.from(selectElement.options).find(o => o.text.includes('Spike'));

                    if (spikeOption && spikeOption.value) {
                        selectElement.value = spikeOption.value;
                        selectElement.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }
        }
    }

    coloring = {
        applyDefault: async () => {
            await this.plugin.dataTransaction(async () => {
                for (const s of this.plugin.managers.structure.hierarchy.current.structures) {
                    await this.plugin.managers.structure.component.updateRepresentationsTheme(s.components, { color: 'default' });
                }
            });
        },
        applyLigand: async (color: number) => {
            this.plugin.dataTransaction(async () => {
                const data = this.plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
                if (!data) {
                    console.log('Data not found in applyLigand seq:');
                    return;
                }

                const state = this.plugin.state.data;
                const update = state.build();

                const StandardResidues = SetUtils.unionMany(
                    AminoAcidNamesL, RnaBaseNames, DnaBaseNames, WaterNames
                );

                const ligand = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
                    'residue-test': Q.core.logic.not([Q.core.set.has([Q.set(...SetUtils.toArray(StandardResidues)), Q.ammp('label_comp_id')])]),
                }), data);

                const lociGetter = async (s: Structure) => StructureSelection.toLociWithSourceUnits(ligand);

                for (const s of this.plugin.managers.structure.hierarchy.current.structures) {
                    const components = s.components;
                    for (const c of components) {
                        // await this.plugin.builders.structure.representation.addRepresentation(c.cell, { type: 'spacefill', color: 'illustrative' });

                        for (const r of c.representations) {
                            const repr = r.cell;

                            const structure = repr.obj!.data.sourceData;

                            const loci = await lociGetter(structure.root);
                            const layer = {
                                bundle: StructureElement.Bundle.fromLoci(loci),
                                color: Color(color),
                                clear: false
                            };

                            const overpaint = Overpaint.ofBundle([layer], structure.root);
                            const merged = Overpaint.merge(overpaint);
                            const filtered = Overpaint.filter(merged, structure);
                            update.to(repr.transform.ref)
                                .apply(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle,
                                    Overpaint.toBundle(filtered),
                                    { tags: 'overpaint-controls' });
                        }
                    }
                }

                return update.commit();
            });
        },
        applyOverPaint: async (sequences: [OverPaintData], ligandColor = '', paintSpikeOnly = true) => {
            this.plugin.dataTransaction(async () => {
                const data = this.plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
                if (!data) {
                    console.log('Data not found in applyOverPaint seq:', sequences);
                    return;
                }

                const state = this.plugin.state.data;
                const update = state.build();

                const lociArr = [];
                for (const sequence of sequences) {
                    const seq = sequence.seq;

                    const list: number[] = [];
                    for (const id of seq.split(',')) {
                        if (id.includes('-')) {
                            const idArr = id.split('-');
                            for (let i = parseInt(idArr[0]); i <= parseInt(idArr[1]); i++) {
                                list.push(i);
                            }
                        } else {
                            list.push(parseInt(id));
                        }
                    }

                    const sel = paintSpikeOnly ? Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
                        'residue-test': Q.core.set.has([Q.set(...list), Q.ammp('auth_seq_id')]),
                        'chain-test': Q.core.rel.eq([Q.struct.atomProperty.macromolecular.chainKey(), 1]),
                        'group-by': Q.struct.atomProperty.macromolecular.residueKey(),
                    }), data) : Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
                        'residue-test': Q.core.set.has([Q.set(...list), Q.ammp('auth_seq_id')]),
                        'group-by': Q.struct.atomProperty.macromolecular.residueKey(),
                    }), data);

                    const lociGetter = async (s: Structure) => StructureSelection.toLociWithSourceUnits(sel);

                    lociArr.push({ lociGetter: lociGetter, color: sequence.color });
                }

                // Add ligand coordinates and color if selected
                if (ligandColor && ligandColor !== '') {
                    const StandardResidues = SetUtils.unionMany(
                        AminoAcidNamesL, RnaBaseNames, DnaBaseNames, WaterNames
                    );

                    const ligand = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
                        'residue-test': Q.core.logic.not([Q.core.set.has([Q.set(...SetUtils.toArray(StandardResidues)), Q.ammp('label_comp_id')])]),
                    }), data);

                    const lociGetter = async (s: Structure) => StructureSelection.toLociWithSourceUnits(ligand);

                    lociArr.push({ lociGetter: lociGetter, color: parseInt(ligandColor) });
                }

                for (const s of this.plugin.managers.structure.hierarchy.current.structures) {
                    const components = s.components;
                    for (const c of components) {
                        for (const r of c.representations) {
                            const repr = r.cell;

                            const structure = repr.obj!.data.sourceData;

                            const layers = [];
                            for (const l of lociArr) {
                                const lociGetter = l.lociGetter;
                                const color = l.color;

                                const loci = await lociGetter(structure.root);
                                if (!Loci.isEmpty(loci)) {
                                    const layer = {
                                        bundle: StructureElement.Bundle.fromLoci(loci),
                                        // color: Color(0),
                                        color: Color(color),
                                        clear: false
                                    };

                                    layers.push(layer);
                                }
                            }

                            const overpaint = Overpaint.ofBundle(layers, structure.root);
                            const merged = Overpaint.merge(overpaint);
                            const filtered = Overpaint.filter(merged, structure);
                            update.to(repr.transform.ref)
                                .apply(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle,
                                    Overpaint.toBundle(filtered),
                                    { tags: 'overpaint-controls' });

                        }
                    }
                }

                return update.commit();
            });
        },
        clearOverPaint: async (clearCanvas = false) => {
            this.plugin.managers.interactivity.lociSelects.deselectAll();
            if (clearCanvas) {
                const state = this.plugin.state.data;
                const update = state.build();

                for (const s of this.plugin.managers.structure.hierarchy.current.structures) {
                    const components = s.components;
                    for (const c of components) {
                        for (const r of c.representations) {
                            update.to(r.cell.transform.ref)
                                .apply(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle,
                                    Overpaint.toBundle({ layers: [] }),
                                    { tags: 'overpaint-controls' });
                        }
                    }
                }
                await update.commit();
            }
        }
    };

    handleResize() {
        this.plugin.layout.events.updated.next(void 0);
    }
}

export interface LoadStructureOptions {
    representationParams?: StructureRepresentationPresetProvider.CommonParams
}

export interface VolumeIsovalueInfo {
    type: 'absolute' | 'relative',
    value: number,
    color: Color,
    alpha?: number,
    volumeIndex?: number
}

export interface LoadTrajectoryParams {
    model: { kind: 'model-url', url: string, format?: BuiltInTrajectoryFormat /* mmcif */, isBinary?: boolean }
    | { kind: 'model-data', data: string | number[] | ArrayBuffer | Uint8Array, format?: BuiltInTrajectoryFormat /* mmcif */ }
    | { kind: 'topology-url', url: string, format: BuiltInTopologyFormat, isBinary?: boolean }
    | { kind: 'topology-data', data: string | number[] | ArrayBuffer | Uint8Array, format: BuiltInTopologyFormat },
    modelLabel?: string,
    coordinates: { kind: 'coordinates-url', url: string, format: BuiltInCoordinatesFormat, isBinary?: boolean }
    | { kind: 'coordinates-data', data: string | number[] | ArrayBuffer | Uint8Array, format: BuiltInCoordinatesFormat },
    coordinatesLabel?: string,
    preset?: keyof PresetTrajectoryHierarchy
}

export const ViewerAutoPreset = StructureRepresentationPresetProvider({
    id: 'preset-structure-representation-viewer-auto',
    display: {
        name: 'Automatic (w/ Annotation)', group: 'Annotation',
        description: 'Show standard automatic representation but colored by quality assessment (if available in the model).'
    },
    isApplicable(a) {
        return (
            !!a.data.models.some(m => QualityAssessment.isApplicable(m, 'pLDDT')) ||
            !!a.data.models.some(m => QualityAssessment.isApplicable(m, 'qmean'))
        );
    },
    params: () => StructureRepresentationPresetProvider.CommonParams,
    async apply(ref, params, plugin) {
        const structureCell = StateObjectRef.resolveAndCheck(plugin.state.data, ref);
        const structure = structureCell?.obj?.data;
        if (!structureCell || !structure) return {};

        if (!!structure.models.some(m => QualityAssessment.isApplicable(m, 'pLDDT'))) {
            return await QualityAssessmentPLDDTPreset.apply(ref, params, plugin);
        } else if (!!structure.models.some(m => QualityAssessment.isApplicable(m, 'qmean'))) {
            return await QualityAssessmentQmeanPreset.apply(ref, params, plugin);
        } else {
            return await PresetStructureRepresentations.auto.apply(ref, params, plugin);
        }
    }
});

(window as any).BVBRCMolStarWrapper = new BVBRCMolStarWrapper();
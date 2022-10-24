/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { PDBeStructureQualityReport } from '../../extensions/pdbe';
import {EmptyLoci, Loci} from '../../mol-model/loci';
import {Structure, StructureElement, StructureSelection} from '../../mol-model/structure';
import { AnimateModelIndex } from '../../mol-plugin-state/animation/built-in/model-index';
import { BuiltInTrajectoryFormat } from '../../mol-plugin-state/formats/trajectory';
import { createPluginUI } from '../../mol-plugin-ui';
import { PluginUIContext } from '../../mol-plugin-ui/context';
import { DefaultPluginUISpec } from '../../mol-plugin-ui/spec';
import { PluginCommands } from '../../mol-plugin/commands';
import { Script } from '../../mol-script/script';
import { Asset } from '../../mol-util/assets';
import { Color } from '../../mol-util/color';
import { StripedResidues } from './coloring';
import { CustomToastMessage } from './controls';
import { CustomColorThemeProvider } from './custom-theme';
import './index.html';
import { buildStaticSuperposition, dynamicSuperpositionTest, StaticSuperpositionTestData } from './superposition';
import {DefaultColorSwatch} from '../../mol-util/color/swatches';
import {Overpaint} from '../../mol-theme/overpaint';
import {StateTransforms} from '../../mol-plugin-state/transforms';
require('mol-plugin-ui/skin/light.scss');
import {featureDataString} from './sars2-features';
import {Canvas3DProps} from '../../mol-canvas3d/canvas3d';
import { PluginStateObject } from '../../mol-plugin-state/objects';
import { StateObjectSelector, StateTransformer, StateObject } from '../../mol-state';
import {SetUtils} from '../../mol-util/set';
import {AminoAcidNamesL, DnaBaseNames, RnaBaseNames, WaterNames} from '../../mol-model/structure/model/types';

type LoadParams = { url: string, format?: BuiltInTrajectoryFormat, isBinary?: boolean, assemblyId?: string, selection?: string, displaySpikeSequence?: boolean }
type HeatMapData = { seq: string, vol: number };
type OverPaintData = { seq: string, color: number };
type _Preset = Pick<Canvas3DProps, 'postprocessing' | 'renderer'>
type Preset = { [K in keyof _Preset]: Partial<_Preset[K]> }

const Canvas3DPresets = {
    illustrative: {
        canvas3d: <Preset>{
            postprocessing: {
                occlusion: { name: 'on', params: { samples: 32, radius: 6, bias: 1.4, blurKernelSize: 15, resolutionScale: 1 } },
                /*outline: { name: 'on', params: { scale: 1, threshold: 0.33, color: Color(0x000000) } }*/
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

class BVBRCMolStarWrapper {
    defaultColors = DefaultColorSwatch;
    featureData = featureDataString;

    plugin: PluginUIContext;
    components: { polymer: StateObjectSelector<PluginStateObject.Molecule.Structure, StateTransformer<StateObject<any, StateObject.Type<any>>, StateObject<any, StateObject.Type<any>>, any>> | undefined; ligand: StateObjectSelector<PluginStateObject.Molecule.Structure, StateTransformer<StateObject<any, StateObject.Type<any>>, StateObject<any, StateObject.Type<any>>, any>> | undefined; water: StateObjectSelector<PluginStateObject.Molecule.Structure, StateTransformer<StateObject<any, StateObject.Type<any>>, StateObject<any, StateObject.Type<any>>, any>> | undefined; };
    private polymerSelector: StateObjectSelector<PluginStateObject.Molecule.Structure.Representation3D>;
    private ligandSelector: StateObjectSelector<PluginStateObject.Molecule.Structure.Representation3D>;

    async init(target: string | HTMLElement) {
        this.plugin = await createPluginUI(typeof target === 'string' ? document.getElementById(target)! : target, {
            ...DefaultPluginUISpec(),
            layout: {
                initial: {
                    isExpanded: true,
                    showControls: true,
                    regionState: {
                        bottom: 'full',
                        left: 'collapsed',
                        right: 'full',
                        top: 'full',
                    }
                }
            },
            components: {
                remoteState: 'none',
            }
        });

        this.plugin.representation.structure.themes.colorThemeRegistry.add(StripedResidues.colorThemeProvider!);
        this.plugin.representation.structure.themes.colorThemeRegistry.add(CustomColorThemeProvider);
        this.plugin.managers.lociLabels.addProvider(StripedResidues.labelProvider!);
        this.plugin.customModelProperties.register(StripedResidues.propertyProvider, true);
    }

    async load({ url, format = 'mmcif', isBinary = false, assemblyId = '', selection = '', displaySpikeSequence = false}: LoadParams) {
        await this.plugin.clear();

        const data = await this.plugin.builders.data.download({ url: Asset.Url(url), isBinary }, { state: { isGhost: true } });
        const trajectory = await this.plugin.builders.structure.parseTrajectory(data, format);
        const model = await this.plugin.builders.structure.createModel(trajectory);
        const structure = await this.plugin.builders.structure.createStructure(model);

        this.plugin.build();

        await this.plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
            structure: assemblyId ? {
                name: 'assembly',
                params: { id: assemblyId }
            } : {
                name: 'model',
                params: {}
            },
            showUnitcell: false,
            representationPreset: 'auto'
        });

        await this.plugin.builders.structure.representation.applyPreset(structure, 'polymer-and-ligand');
        /* const structure = await this.plugin.builders.structure.createStructure(model, assemblyId ? { name: 'assembly', params: { id: assemblyId } } : { name: 'model', params: { } });*/

        this.components = {
            polymer: await this.plugin.builders.structure.tryCreateComponentStatic(structure, 'polymer'),
            ligand: await this.plugin.builders.structure.tryCreateComponentStatic(structure, 'ligand'),
            water: await this.plugin.builders.structure.tryCreateComponentStatic(structure, 'water'),
        };

        const props = Canvas3DPresets['occlusion'];
        PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: {
            ...props,
            renderer: {
                ...this.plugin.canvas3d!.props.renderer,
                ...props.canvas3d.renderer
            },
            postprocessing: {
                ...this.plugin.canvas3d!.props.postprocessing,
                ...props.canvas3d.postprocessing
            },
        }});


        /* const objData = this.plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;

        if(objData) {
            const sel = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
                'residue-test': Q.core.set.has([Q.set([3, 5]), Q.ammp('auth_seq_id')])
            }), objData);
            console.log('SELECTION:::', sel);
            const lociGetter = StructureSelection.toLociWithSourceUnits(sel);
            console.log('lociGetter:::', lociGetter);
        }*/

        if (selection && selection !== '') {
            this.interactivity.highlightOn(selection);
            /* const ligand = MS.struct.generator.atomGroups({
                'residue-test': MS.core.rel.eq([MS.struct.atomProperty.macromolecular.label_comp_id(), selection]),
            });

            update.to(structure)
                .apply(StateTransforms.Model.StructureSelectionFromExpression, { label: 'Surroundings', expression: ligand })
                .apply(StateTransforms.Representation.StructureRepresentation3D, createStructureRepresentationParams(this.plugin, structure.data, {
                    type: 'ball-and-stick',
                    color: 'uniform',
                    colorParams: { value: ColorNames.aliceblue }
                }));

            await update.commit();*/

            /* let update = this.plugin.state.behaviors.build();
            let assembly = this.plugin.state.behaviors.select(StateSelection.Generators.ofType(PluginStateObject.Molecule.Structure))[0]
            let obj = assembly.obj as PluginStateObject.Molecule.Structure

            const group = update.to(assembly)
                .group(StateTransforms.Misc.CreateGroup, { label: 'Surroundings' }, { ref: 'TEST' })

            group.apply(StateTransforms.Model.StructureSelectionFromExpression, { label: 'Surroundings', expression: ligand })
                .apply(StateTransforms.Representation.StructureRepresentation3D, createStructureRepresentationParams(this.plugin, obj.data, {
                    type: 'label',
                    typeParams: {level: 'residue'}
                }), { tags: ['labely'] })

            await PluginCommands.State.Update(this.plugin, {state: this.plugin.state.data, tree: update})*/
        }

        await this.coloring.applyDefault();

        if (displaySpikeSequence) {
            let selectElements = document.getElementsByTagName('select');
            for (let selectElement of selectElements as any) {
                let title = selectElement.getAttribute('title');
                if (title && title.startsWith('[Entity]')) {
                    // Looking for spike protein option
                    // @ts-ignore
                    const spikeOption: HTMLOptionElement = Array.from(selectElement.options).find(o => o.text.includes('Spike'));

                    if (spikeOption && spikeOption.value) {
                        selectElement.value = spikeOption.value;
                        selectElement.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                }
            }
        }
    }

    setBackground(color: number) {
        PluginCommands.Canvas3D.SetSettings(this.plugin, { settings: props => { props.renderer.backgroundColor = Color(color); } });
    }

    toggleSpin() {
        if (!this.plugin.canvas3d) return;

        const trackball = this.plugin.canvas3d.props.trackball;
        PluginCommands.Canvas3D.SetSettings(this.plugin, {
            settings: {
                trackball: {
                    ...trackball,
                    animate: trackball.animate.name === 'spin'
                        ? { name: 'off', params: {} }
                        : { name: 'spin', params: { speed: 1 } }
                }
            }
        });
        if (this.plugin.canvas3d.props.trackball.animate.name !== 'spin') {
            PluginCommands.Camera.Reset(this.plugin, {});
        }
    }

    private animateModelIndexTargetFps() {
        return Math.max(1, this.animate.modelIndex.targetFps | 0);
    }

    animate = {
        modelIndex: {
            targetFps: 8,
            onceForward: () => { this.plugin.managers.animation.play(AnimateModelIndex, { duration: { name: 'computed', params: { targetFps: this.animateModelIndexTargetFps() } }, mode: { name: 'once', params: { direction: 'forward' } } }); },
            onceBackward: () => { this.plugin.managers.animation.play(AnimateModelIndex, { duration: { name: 'computed', params: { targetFps: this.animateModelIndexTargetFps() } }, mode: { name: 'once', params: { direction: 'backward' } } }); },
            palindrome: () => { this.plugin.managers.animation.play(AnimateModelIndex, { duration: { name: 'computed', params: { targetFps: this.animateModelIndexTargetFps() } }, mode: { name: 'palindrome', params: {} } }); },
            loop: () => { this.plugin.managers.animation.play(AnimateModelIndex, { duration: { name: 'computed', params: { targetFps: this.animateModelIndexTargetFps() } }, mode: { name: 'loop', params: { direction: 'forward' } } }); },
            stop: () => this.plugin.managers.animation.stop()
        }
    }

    coloring = {
        applyStripes: async () => {
            this.plugin.dataTransaction(async () => {
                for (const s of this.plugin.managers.structure.hierarchy.current.structures) {
                    await this.plugin.managers.structure.component.updateRepresentationsTheme(s.components, { color: StripedResidues.propertyProvider.descriptor.name as any });
                }
            });
        },
        applyCustomTheme: async () => {
            this.plugin.dataTransaction(async () => {
                for (const s of this.plugin.managers.structure.hierarchy.current.structures) {
                    await this.plugin.managers.structure.component.updateRepresentationsTheme(s.components, { color: CustomColorThemeProvider.name as any });
                }
            });
        },
        applyDefault: async () => {
            this.plugin.dataTransaction(async () => {
                for (const s of this.plugin.managers.structure.hierarchy.current.structures) {
                    await this.plugin.managers.structure.component.updateRepresentationsTheme(s.components, { color: 'default' });
                }
            });
        },
        applyHeatMap: async (url: string) => {
            console.log('TEST2 ');
            let heatMapData = new Array<HeatMapData>(), minValue: number = 0, maxValue: number = 0;
            fetch(url).then(response => {
                if(response.ok) {
                    response.text().then(data => {
                        for(let line of data.split('\n')) {
                            const columns = line.split('\t');
                            const seq = columns[0];
                            const vol = parseFloat(columns[1]);

                            if(vol < minValue)
                                minValue = vol;
                            if(vol > maxValue)
                                maxValue = vol;

                            heatMapData.push({seq, vol});
                        }

                        // @ts-ignore
                        let overPaint: [OverPaintData] = [];
                        for (let {seq, vol} of heatMapData) {
                            overPaint.push({seq, color: this.coloring.numberToColorNew(seq, vol, minValue, maxValue)});
                        }
                        this.coloring.applyOverPaint(overPaint, '', false, true);
                    });
                }
            });
        },
        numberToColorNew: (seq: any, value: number, min: number, max: number) => {
            /* const red = '#FF0000';
            const white = '#FFFFFF';
            const blue = '#0000FF'; */
            const percentColors = [
                { pct: 0.0, color: { r: 0xff, g: 0x00, b: 0x00 } },
                { pct: 0.5, color: { r: 0xff, g: 0xff, b: 0xff } },
                { pct: 1.0, color: { r: 0x00, g: 0x00, b: 0xff } } ];
            /* const maxMinDiff = max - min;
            const diff = value - min;
            const pct = diff / maxMinDiff;*/
            const pct = ((value - min) / (max - min));
            for (let i = 1; i < percentColors.length - 1; i++) {
                if (pct < percentColors[i].pct) {
                    break;
                }
            }
            // let lower = percentColors[i - 1];
            // let upper = percentColors[i];
            let lower = percentColors[1];
            let upper = percentColors[0];
            let range = upper.pct - lower.pct;
            let rangePct = (pct - lower.pct) / range;
            let pctLower = 1 - rangePct;
            let pctUpper = rangePct;
            let color = {
                r: Math.floor(lower.color.r * pctLower + upper.color.r * pctUpper),
                g: Math.floor(lower.color.g * pctLower + upper.color.g * pctUpper),
                b: Math.floor(lower.color.b * pctLower + upper.color.b * pctUpper)
            };

            console.log(`seq: ${seq} val: ${value} pct: ${pct} color: ${color.r} ${color.g} ${color.b}`);

            return parseInt(('#' + this.coloring.componentToHex(color.r) + this.coloring.componentToHex(color.g) + this.coloring.componentToHex(color.b))
                .replace('#', '0x'), 16);
        },
        numberToColor: (seq: any, i: number, min: number, max: number) => {
            /* let ratio = i;
            if (min > 0 || max < 1) {
                if (i < min) {
                    ratio = 0;
                } else if (i > max) {
                    ratio = 1;
                } else {
                    const range = max - min;
                    ratio = (i - min) / range;
                }
            }*/
            const range = max - min;
            const ratio = (i - min) / range;

            // as the function expects a value between 0 and 1, and red = 0° and green = 120°
            // we convert the input to the appropriate hue value
            let hue = ratio * 1.2 / 3.60;

            // we convert hsl to rgb (saturation 100%, lightness 50%)
            let rgb = this.coloring.hslToRgb(hue * 2, 1, .5);
            // we format to css value and return
            console.log(`seq: ${seq} hue: ${hue} number: ${i} min: ${min} max: ${max} ratio: ${ratio} rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
            return parseInt(('#' + this.coloring.componentToHex(rgb[0]) + this.coloring.componentToHex(rgb[1]) + this.coloring.componentToHex(rgb[2]))
                .replace('#', '0x'), 16);
        },
        componentToHex: (c: number) => {
            const hex = c.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        },
        hslToRgb: (h: number, s: number, l: number) => {
            let r, g, b;

            if(s === 0){
                r = g = b = l; // achromatic
            } else {
                let q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                let p = 2 * l - q;
                r = this.coloring.hue2rgb(p, q, h + 1 / 3);
                g = this.coloring.hue2rgb(p, q, h);
                b = this.coloring.hue2rgb(p, q, h - 1 / 3);
            }

            return [Math.floor(r * 255), Math.floor(g * 255), Math.floor(b * 255)];
        },
        hue2rgb: (p: number, q: number, t: number) => {
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1 / 6) return p + (q - p) * 6 * t;
            if(t < 1 / 2) return q;
            if(t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
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
                                    Overpaint.toBundle({layers: []}),
                                    {tags: 'overpaint-controls'});
                        }
                    }
                }
                await update.commit();
            }

            if(this.polymerSelector) {
                PluginCommands.State.RemoveObject(this.plugin, {state: this.plugin.state.data, ref: this.polymerSelector.ref});
            }

            if(this.ligandSelector) {
                PluginCommands.State.RemoveObject(this.plugin, {state: this.plugin.state.data, ref: this.ligandSelector.ref});
            }
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

                            this.plugin.managers.interactivity.lociSelects.select({ loci }, true, Color(color), false);

                            const overpaint = Overpaint.ofBundle([layer], structure.root);
                            const merged = Overpaint.merge(overpaint);
                            const filtered = Overpaint.filter(merged, structure);
                            update.to(repr.transform.ref)
                                .apply(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle,
                                    Overpaint.toBundle(filtered),
                                    {tags: 'overpaint-controls'});
                        }
                    }
                }

                return update.commit();
            });
        },
        applyOverPaint: async (sequences: [OverPaintData], ligandColor = '', paintSpikeOnly = true, isHeatMap = false) => {
            this.plugin.dataTransaction(async () => {
                const data = this.plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
                if (!data) {
                    console.log('Data not found in applyOverPaint seq:', sequences);
                    return;
                }

                // Enable ball&stick for heatmap
                if (isHeatMap) {
                    if (this.components.polymer) this.polymerSelector = await this.plugin.builders.structure.representation.addRepresentation(this.components.polymer, {
                        type: 'spacefill',
                        color: 'illustrative'
                    });
                    if (this.components.ligand) this.ligandSelector = await this.plugin.builders.structure.representation.addRepresentation(this.components.ligand, {
                        type: 'ball-and-stick',
                        color: 'element-symbol',
                        colorParams: {carbonColor: {name: 'element-symbol', params: {}}}
                    });

                    const props = Canvas3DPresets['occlusion'];
                    PluginCommands.Canvas3D.SetSettings(this.plugin, {
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
                }

                const state = this.plugin.state.data;
                const update = state.build();

                let lociArr = [];
                for (let sequence of sequences) {
                    const seq = sequence.seq;

                    let list: number[] = [];
                    for (let id of seq.split(',')) {
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

                    lociArr.push({lociGetter: lociGetter, color: sequence.color});
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

                    lociArr.push({lociGetter: lociGetter, color: parseInt(ligandColor)});
                }

                for (const s of this.plugin.managers.structure.hierarchy.current.structures) {
                    const components = s.components;
                    for (const c of components) {
                        // await this.plugin.builders.structure.representation.addRepresentation(c.cell, { type: 'spacefill', color: 'illustrative' });

                        for (const r of c.representations) {
                            const repr = r.cell;

                            const structure = repr.obj!.data.sourceData;

                            let layers = [];
                            for (let l of lociArr) {
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

                                this.plugin.managers.interactivity.lociSelects.select({ loci }, true, Color(color), true);
                            }

                            // this.plugin.managers.structure.selection.fromLoci('add', loci, true, Color(color));
                            // this.plugin.canvas3d?.setProps({renderer: { selectColor: Color(color) }});
                            // this.plugin.managers.interactivity.lociSelects.select({ loci }, true, Color(color), false);

                            const overpaint = Overpaint.ofBundle(layers, structure.root);
                            const merged = Overpaint.merge(overpaint);
                            const filtered = Overpaint.filter(merged, structure);
                            update.to(repr.transform.ref)
                                .apply(StateTransforms.Representation.OverpaintStructureRepresentation3DFromBundle,
                                    Overpaint.toBundle(filtered),
                                    {tags: 'overpaint-controls'});

                            // this.plugin.managers.structure.selection.modify('add', loci);
                            // this.plugin.managers.structure.focus.addFromLoci(loci);
                        }
                    }
                }

                return update.commit();
            });
        }
    }

    interactivity = {
        highlightOn: (seq: string) => {
            const data = this.plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
            if (!data) {
                console.log('Data not found1');
                return;
            } else {
                console.log('Data found1');
            }

            const sel = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
                'residue-test': Q.core.set.has([Q.set(...[60, 87]), Q.ammp('auth_seq_id')]),
            }), data);/*

                        const sel = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
                            'residue-test': Q.core.rel.eq([Q.struct.atomProperty.macromolecular.label_comp_id(), seq]),
                            'group-by': Q.struct.atomProperty.macromolecular.residueKey()
                        }), data);*/
            const loci = StructureSelection.toLociWithSourceUnits(sel);
            // this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci });
            this.plugin.managers.structure.focus.setFromLoci(loci);
            this.plugin.managers.camera.focusLoci(loci);
        },
        clearHighlight: () => {
            this.plugin.managers.interactivity.lociHighlights.highlightOnly({ loci: EmptyLoci });
        }
    }

    tests = {
        staticSuperposition: async () => {
            await this.plugin.clear();
            return buildStaticSuperposition(this.plugin, StaticSuperpositionTestData);
        },
        dynamicSuperposition: async () => {
            await this.plugin.clear();
            return dynamicSuperpositionTest(this.plugin, ['1tqn', '2hhb', '4hhb'], 'HEM');
        },
        toggleValidationTooltip: () => {
            return this.plugin.state.updateBehavior(PDBeStructureQualityReport, params => { params.showTooltip = !params.showTooltip; });
        },
        showToasts: () => {
            PluginCommands.Toast.Show(this.plugin, {
                title: 'Toast 1',
                message: 'This is an example text, timeout 3s',
                key: 'toast-1',
                timeoutMs: 3000
            });
            PluginCommands.Toast.Show(this.plugin, {
                title: 'Toast 2',
                message: CustomToastMessage,
                key: 'toast-2'
            });
        },
        hideToasts: () => {
            PluginCommands.Toast.Hide(this.plugin, { key: 'toast-1' });
            PluginCommands.Toast.Hide(this.plugin, { key: 'toast-2' });
        }
    }
}

(window as any).BVBRCMolStarWrapper = new BVBRCMolStarWrapper();

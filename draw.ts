﻿import { scaleLinear, scaleTime } from 'd3-scale'
import { BaseType, event as d3event, selectAll, Selection } from 'd3-selection'
import { line } from 'd3-shape'
import { timeout as runTimeout } from 'd3-timer'
import { zoom as d3zoom, ZoomTransform } from 'd3-zoom'

import { MyAxis, Orientation } from './axis'
import { MyTransform, updateNode } from './MyTransform'
import { IMinMax, SegmentTree } from './segmentTree'
import { AR1Basis, AR1, betweenBasesAR1, betweenTBasesAR1, bPlaceholder, bUnit } from './viewZoomTransform'

function drawProc(f: Function) {
	let requested = false

	return (...params: any[]) => {
		if (!requested) {
			requested = true
			runTimeout((elapsed: number) => {
				requested = false
				f(params)
			})
		}
	}
}

function bindAxisToDom(svg: Selection<BaseType, {}, HTMLElement, any>, axis: any, scale: any) {
	axis.setScale(scale)
	return svg.append('g')
		.attr('class', 'axis')
		.call(axis.axis.bind(axis))
}

export class TimeSeriesChart {
	public zoom: () => void
	public onHover: (x: number) => void
	private drawNewData: () => void
	private data: Array<[number, number]>

	// updated when a new point is added
	private tree: SegmentTree

	// Updated when a new point is added
	// used to convert indices to dates shown by X axis
	// Date.now() style timestamp
	private timeAtIdx0: number

	// Step by X axis
	// Date.now() style timestamp delta
	private timeStep: number

	// автоморфизм действительных чисел в первой степени
	// преобразование из простраства индексов
	// в пространство времён
	private idxToTime: AR1

	// преобразование добавления точки
	// когда добавляем точку в массиив надо
	// idxToTime.composeWith(idxShift)
	// это автоморфизм пространства индексов
	// то есть преобразование пространства индексов
	// в себя, а не в другое пространство
	private idxShift: AR1

	// две точки - начало и конец массива в пространстве индексов
	// стоит думать о них как об абстрактных точках
	// нарисованных в мире за телевизором на наших графиках
	// а не в терминах их координат
	private bIndexFull: AR1Basis

	private buildSegmentTreeTuple: (index: number, elements: any) => IMinMax
	private zoomHandler: () => void
	private mouseMoveHandler: () => void

	private legendTime: Selection<BaseType, {}, HTMLElement, any>
	private legendGreen: Selection<BaseType, {}, HTMLElement, any>
	private legendBlue: Selection<BaseType, {}, HTMLElement, any>

	private highlightedDataIdx: number

	constructor(
		svg: Selection<BaseType, {}, HTMLElement, any>,
		legend: Selection<BaseType, {}, HTMLElement, any>,
		startTime: number, timeStep: number,
		data: Array<[number, number]>,
		buildSegmentTreeTuple: (index: number, elements: any) => IMinMax,
		zoomHandler: () => void,
		mouseMoveHandler: () => void) {

		this.legendTime = legend.select('.chart-legend__time')
		this.legendGreen = legend.select('.chart-legend__green_value')
		this.legendBlue = legend.select('.chart-legend__blue_value')

		// здесь второй базис образован не двумя точками, а
		// эквивалентно точкой и вектором
		// хорошо бы сделать например basisAR1PV()
		// типа смарт-конструктор
		// интересно что есть короткая эквивалентная формулировка
		// this.idxToSpace = new AR1(startTime, timeStep)
		// но она возвращает нас к координатному мышлению
		this.idxToTime = betweenTBasesAR1(bUnit, new AR1Basis(startTime, startTime + timeStep))

		// при добавлении точки первый и второй элемент
		// становятся на место нулевого и первого соответственно
		this.idxShift = betweenTBasesAR1(new AR1Basis(1, 2), bUnit)
		this.buildSegmentTreeTuple = buildSegmentTreeTuple
		this.zoomHandler = zoomHandler
		this.mouseMoveHandler = mouseMoveHandler
		this.bIndexFull = new AR1Basis(0, data.length - 1)
		this.drawChart(svg, data)
	}

	public updateChartWithNewData(newData: [number, number]) {
		this.data.push(newData)
		this.data.shift()

		this.idxToTime = this.idxToTime.composeWith(this.idxShift)

		this.drawNewData()
	}

	private drawChart(svg: Selection<BaseType, {}, HTMLElement, any>, data: Array<[number, number]>) {
		this.data = data

		const node: SVGSVGElement = svg.node() as SVGSVGElement
		const div: HTMLElement = node.parentNode as HTMLElement

		const width = div.clientWidth
		const height = div.clientHeight

		svg.attr('width', width)
		svg.attr('height', height)

		const view = svg.select('g.view')

		// это просто извращённый способ добавить
		// в группу два элемента <path>
		// .enter() это часть фреймворка d3 для работы
		// с обновлениями, но мы пока игнорируем и
		// делаем обновления руками
		const path = view
			.selectAll('path')
			.data([0, 1])
			.enter().append('path')

		// тут наши перевернутые базисы которые мы
		// cтеснительно запрятали в onViewPortResize
		// таки вылезли

		// на видимую область можно смотреть абстрактно
		// как на отдельное пространство

		// ось Y перевернута - что выглядит на языке
		// базисов как перевернутый базис
		//
		// а на языке векторов как разность точек, которая
		// у X положительна а у Y отрицательна
		// ну и наоборот если перевернем первый базис
		// то второй тоже перевернется но переворачивание
		// по-прежнему выглядит как умножение разности на -1
		//	
		// короче неважно какой из них считать первичным
		// в любом случае один перевернут по отношению к другому
		const bScreenXVisible = new AR1Basis(0, width)
		const bScreenYVisible = new AR1Basis(height, 0)

		// интерфейс с лигаси-кодом. Некоторая многословость простительна
		const x = scaleTime().range(bScreenXVisible.toArr())
		const y = scaleLinear().range(bScreenYVisible.toArr())
		const viewNode: SVGGElement = view.node() as SVGGElement
		const pathTransform = new MyTransform(svg.node() as SVGSVGElement, viewNode)

		// bIndexVisible is the visible ends of model
		// affine space at chart edges.
		// They are updated by zoom and pan or animation
		// but unaffected by arrival of new data
		const updateScales = (bIndexVisible: AR1Basis) => {
			// рассчитается деревом отрезков, но все равно долго
			// так что нужно сохранить чтобы
			// два раза не перевычислять для линий графиков и для осей
			const bTemperatureVisible = this.bTemperatureVisible(bIndexVisible)
			// референсное окно имеет достаточно странный вид
			// по горизонтали у нас полный диапазон
			// а по вертикали только видимый
			// надеюсь это исправится при переходе от отдельных
			// пространств по Х и Y к единому пространству
			// являющeмся их прямым произведением
			pathTransform.onReferenceViewWindowResize(this.bIndexFull, bTemperatureVisible)

			const bTimeVisible = bIndexVisible.transformWith(this.idxToTime)
			x.domain(bTimeVisible.toArr())
			y.domain(bTemperatureVisible.toArr())
		}

		this.tree = new SegmentTree(this.data, this.data.length, this.buildSegmentTreeTuple)

		// в референсном окне видны все данные, поэтому
		// передаем bIndexFull в качестее bIndexVisible
		updateScales(this.bIndexFull)

		const xAxis = new MyAxis(Orientation.Bottom, x)
			.ticks(4)
			// изменять размер тиков надо при изменении
			// размеров окна
			.setTickSize(height)
			.setTickPadding(8 - height)

		const yAxis = new MyAxis(Orientation.Right, y)
			.ticks(4, 's')
			.setTickSize(width)
			.setTickPadding(2 - width)

		const gX = bindAxisToDom(svg, xAxis, x)
		const gY = bindAxisToDom(svg, yAxis, y)

		const zoomArea: Selection<any, any, any, any> = svg.append('rect')
			.attr('class', 'zoom')
			.attr('width', width)
			.attr('height', height)
			.call(d3zoom()
				.scaleExtent([1, 40])
				// в перспективе взять экстент из bScreenVisible
				// хотя хез как быть с другим порядком
				.translateExtent([[0, 0], [width, height]])
				.on('zoom', this.zoomHandler.bind(this)))
		zoomArea.on('mousemove', this.mouseMoveHandler.bind(this))

		let currentPanZoomTransformState: ZoomTransform = null

		// it's important that we have only 1 instance
		// of drawProc and not one per event
		// вызывается из zoom и drawNewData
		const scheduleRefresh = drawProc(() => {
			// Apply pan zoom transform
			if (currentPanZoomTransformState != null) {
				d3zoom().transform(zoomArea, currentPanZoomTransformState)
			}

			const bIndexVisible = pathTransform.fromScreenToModelBasisX(bScreenXVisible)
			updateScales(bIndexVisible)
			pathTransform.updateViewNode()

			xAxis.axisUp(gX)
			yAxis.axisUp(gY)

			highlight(this.highlightedDataIdx)
		})
		pathTransform.onViewPortResize(bScreenXVisible, bScreenYVisible)
		pathTransform.onReferenceViewWindowResize(this.bIndexFull, bPlaceholder)

		// вызывается здесь ниже
		// и из публичного updateChartWithNewData()
		// но в принципе должно быть в common.ts
		this.drawNewData = () => {
			// создание дерева не должно
			// дублироваться при создании чарта
			this.tree = new SegmentTree(this.data, this.data.length, this.buildSegmentTreeTuple)
			const drawLine = (cityIdx: number) => line()
				.defined((d: [number, number]) => {
					return !(isNaN(d[cityIdx]) || d[cityIdx] == null)
				})
				.x((d: [number, number], i: number) => i)
				.y((d: [number, number]) => d[cityIdx])

			path.attr('d', (cityIndex: number) => drawLine(cityIndex).call(null, this.data))
			scheduleRefresh()
		}

		this.drawNewData()

		// публичный метод, используется для ретрансляции
		// зум-события нескольким графикам
		this.zoom = () => {
			currentPanZoomTransformState = d3event.transform

			pathTransform.onZoomPan(d3event.transform)
			scheduleRefresh()
		}

		const dotRadius = 3
		const highlightedGreenDot = view.append('circle').attr('cx', 0).attr('cy', 0).attr('r', 1)
		const highlightedBlueDot = view.append('circle').attr('cx', 0).attr('cy', 0).attr('r', 1)

		const identityMatrix = document.createElementNS('http://www.w3.org/2000/svg', 'svg').createSVGMatrix()

		const highlight = (dataIdx: number) => {
			this.highlightedDataIdx = dataIdx
			const hoveredTime = this.idxToTime.applyToPoint(dataIdx)
			const tuple = this.data[Math.round(dataIdx)]

			this.legendTime.text(new Date(hoveredTime).toLocaleString())
			this.legendGreen.text(isNaN(tuple[0]) ? ' ' : tuple[0])
			this.legendBlue.text(isNaN(tuple[1]) ? ' ' : tuple[1])

			const dotRadiusXModel = pathTransform.fromScreenToModelX(0) - pathTransform.fromScreenToModelX(dotRadius)
			const dotRadiusYModel = pathTransform.fromScreenToModelY(0) - pathTransform.fromScreenToModelY(dotRadius)

			const greenDotHoverMatrix = identityMatrix.translate(dataIdx, isNaN(tuple[0]) ? 0 : tuple[0]).scaleNonUniform(dotRadiusXModel, dotRadiusYModel)
			const blueDotHoverMatrix = identityMatrix.translate(dataIdx, isNaN(tuple[1]) ? 0 : tuple[1]).scaleNonUniform(dotRadiusXModel, dotRadiusYModel)

			updateNode(highlightedGreenDot.node() as SVGCircleElement, greenDotHoverMatrix)
			updateNode(highlightedBlueDot.node() as SVGCircleElement, blueDotHoverMatrix)
		}

		this.onHover = (x: number) => {
			const hoveredDataIdx = pathTransform.fromScreenToModelX(x)
			highlight(hoveredDataIdx)
		}

		this.onHover(width)
	}

	private bTemperatureVisible(bIndexVisible: AR1Basis) : AR1Basis {
		// просто функция между базисами
		const [minIdxX, maxIdxX] = bIndexVisible.toArr()
		const { min, max } = this.tree.getMinMax(Math.round(minIdxX), Math.round(maxIdxX))
		return new AR1Basis(min, max)
	}
}

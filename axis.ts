﻿export enum Orientation {
	Top,
	Right,
	Bottom,
	Left
}

const slice = Array.prototype.slice

const identity = (x: any) => x

function center(scale: any) {
	const width = scale.bandwidth() / 2
	return (d: any) => scale(d) + width
}

function translateX(scale0: any, scale1: any, d: any) {
	const x = scale0(d)
	return 'translate(' + (isFinite(x) ? x : scale1(d)) + ',0)'
}

function translateY(scale0: any, scale1: any, d: any) {
	const y = scale0(d)
	return 'translate(0,' + (isFinite(y) ? y : scale1(d)) + ')'
}

export class MyAxis {
	tickArguments: any[]
	tickValues: any
	tickFormat: any
	tickSizeInner: number
	tickSizeOuter: number
	tickPadding: number
	orient: Orientation
	scale1: any
	scale2: any

	constructor(orient: Orientation, scale1: any, scale2?: any) {
		this.orient = orient
		this.scale1 = scale1
		this.scale2 = scale2
		this.tickArguments = []
		this.tickValues = null
		this.tickFormat = null
		this.tickSizeInner = 6
		this.tickSizeOuter = 6
		this.tickPadding = 3
	}

	axis(context: any) {
		const isY = this.scale2 ? true : false
		const values: any = this.tickValues == null ? (this.scale1.ticks ? this.scale1.ticks.apply(this.scale1, this.tickArguments) : this.scale1.domain()) : this.tickValues,
			format: any = this.tickFormat == null ? (this.scale1.tickFormat ? this.scale1.tickFormat.apply(this.scale1, this.tickArguments) : identity) : this.tickFormat,
			spacing: any = Math.max(this.tickSizeInner, 0) + this.tickPadding,
			transform: any = this.orient === Orientation.Top || this.orient === Orientation.Bottom ? translateX : translateY,
			position = (this.scale1.bandwidth ? center : identity)(this.scale1.copy())
		let tick = context.selectAll('.tick').data(values, this.scale1).order(),
			tickExit = tick.exit(),
			tickEnter = tick.enter().append('g').attr('class', 'tick'),
			line = tick.select('line'),
			text = tick.select('text'),
			k = this.orient === Orientation.Top || this.orient === Orientation.Left ? -1 : 1
		let x = ''
		const y = this.orient === Orientation.Left || this.orient === Orientation.Right ? (x = 'x', 'y') : (x = 'y', 'x')

		tick = tick.merge(tickEnter)
		line = line.merge(tickEnter.append('line').attr(x + '2', k * this.tickSizeInner))
		text = text.merge(tickEnter.append('text').attr(x, k * spacing))

		tickExit.remove()

		tick.attr('transform', (d: any) => transform(position, position, d))

		line
			.attr(x + '2', k * this.tickSizeInner)
			.attr(y + '1', 0.5)
			.attr(y + '2', 0.5)

		text
			.attr(x, k * spacing)
			.attr(y, 3)
			.attr('dy', this.orient === Orientation.Top ? '0em' : this.orient === Orientation.Bottom ? '.41em' : '.62em')
			.text(format)

		context
			.attr('text-anchor', this.orient === Orientation.Right ? 'start' : this.orient === Orientation.Left ? 'end' : 'middle')
			.each(function () { this.__axis = position })
	}

	axisUp(context: any) {
		const values = this.tickValues == null ? (this.scale1.ticks ? this.scale1.ticks.apply(this.scale1, this.tickArguments) : this.scale1.domain()) : this.tickValues,
			format = this.tickFormat == null ? (this.scale1.tickFormat ? this.scale1.tickFormat.apply(this.scale1, this.tickArguments) : identity) : this.tickFormat,
			spacing = Math.max(this.tickSizeInner, 0) + this.tickPadding,
			transform = this.orient === Orientation.Top || this.orient === Orientation.Bottom ? translateX : translateY,
			position = (this.scale1.bandwidth ? center : identity)(this.scale1.copy()),
			k = this.orient === Orientation.Top || this.orient === Orientation.Left ? -1 : 1
		let tick = context.selectAll('.tick').data(values, this.scale1).order(),
			tickExit = tick.exit(),
			tickEnter = tick.enter().append('g').attr('class', 'tick'),
			line = tick.select('line'),
			text = tick.select('text')

		let x = ''
		const y = this.orient === Orientation.Left || this.orient === Orientation.Right ? (x = 'x', 'y') : (x = 'y', 'x')

		tick = tick.merge(tickEnter)
		line = line.merge(tickEnter.append('line').attr(x + '2', k * this.tickSizeInner))
		text = text.merge(tickEnter.append('text').attr(x, k * spacing))

		tickExit.remove()

		tick.attr('transform', (d: any) => transform(position, position, d))

		line
			.attr(x + '2', k * this.tickSizeInner)
			.attr(y + '1', 0.5)
			.attr(y + '2', 0.5)

		text
			.attr(x, k * spacing)
			.attr(y, 0.5)
			.attr('dy', this.orient === Orientation.Top ? '0em' : this.orient === Orientation.Bottom ? '.41em' : '.62em')
			.text(format)
	}

	setScale(scale1: any, scale2?: any) {
		this.scale1 = scale1
		this.scale2 = scale2
		return this
	}

	ticks(...args: any[]) {
		return this.tickArguments = slice.call(args), this
	}

	setTickArguments(_: any) {
		return this.tickArguments = _ == null ? [] : slice.call(_), this
	}

	setTickValues(_: any) {
		return this.tickValues = _ == null ? null : slice.call(_), this
	}

	setTickFormat(_: any) {
		return this.tickFormat = _, this
	}

	setTickSize(_: number): MyAxis {
		return this.tickSizeInner = this.tickSizeOuter = +_, this
	}

	setTickSizeInner(_: number) {
		return this.tickSizeInner = +_, this
	}

	setTickSizeOuter(_: number) {
		return this.tickSizeOuter = +_, this
	}

	setTickPadding(_: number) {
		return this.tickPadding = +_, this
	}
}

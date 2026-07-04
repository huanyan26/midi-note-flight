const Easing = {
			easeOutBack: t => {
				const c1 = 1.70158;
				const c3 = c1 + 1;
				return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
			},
			easeOut: t => 1 - (1 - t) * (1 - t),
			easeIn: t => t * t
		};

export default function BookingStepper({ step, step2Label = 'Schedule' }) {
  const steps = [
    { n: 1, label: 'Your plan' },
    { n: 2, label: step2Label },
    { n: 3, label: 'Review & Pay' },
  ];
  return (
    <div className='flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-6 sm:mb-10 px-2'>
      {steps.map((s, i) => {
        const active = s.n === step;
        const done = s.n < step;
        const circle = active
          ? 'bg-[#00ce84] text-white'
          : done
          ? 'bg-[#D9FF7A] text-gray-800'
          : 'bg-gray-200 text-gray-500';
        return (
          <div key={s.n} className='flex flex-col items-center gap-1 sm:flex-row sm:gap-2'>
            <div className='flex flex-col items-center gap-1 sm:flex-row sm:gap-2'>
              <span className={'h-7 w-7 sm:h-8 sm:w-8 rounded-full grid place-items-center text-xs sm:text-sm font-semibold ' + circle}>
                {done ? '✓' : s.n}
              </span>
              <span className={'text-xs sm:text-sm font-medium text-center sm:text-left ' + (active ? 'text-gray-900' : 'text-gray-500')}>
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && <div className='hidden sm:block h-px w-6 sm:w-10 bg-gray-300' />}
          </div>
        );
      })}
    </div>
  );
}



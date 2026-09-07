import type { ComponentPropsWithoutRef, ReactNode } from 'react';

/**
 * Peças compartilhadas da interface.
 *
 * Extraídas do que **já estava repetido** entre a sala e a home, o pill de
 * controle e o botão preenchido apareciam com as mesmas dez classes em quatro
 * lugares. Nada aqui foi inventado por antecipação: componente criado para um
 * uso futuro imaginado é dívida, não sistema.
 *
 * A gramática visual é a mesma em todo canto: superfície com borda de 1px,
 * cartão em 20px de raio, controle em pílula, e o lilás reservado para a ação
 * principal e para o que está ao vivo.
 */

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  /** `primary` é a ação principal da tela. Só deve haver uma por vez. */
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
};

const BUTTON_VARIANTS = {
  primary: 'bg-lilac text-white hover:bg-lilac-soft',
  outline: 'border border-line hover:border-denim/60',
  ghost: 'border border-transparent text-denim hover:border-line hover:text-sky',
} as const;

const BUTTON_SIZES = {
  sm: 'px-4 py-2.5 text-[13px]',
  md: 'px-7 py-3.5 text-[14px]',
} as const;

export function Button({
  variant = 'outline',
  size = 'sm',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={`cursor-pointer rounded-full font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
    />
  );
}

/** Superfície elevada. É o contêiner de tudo que não é controle. */
export function Card({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-card border border-line bg-surface/70 ${className}`}>
      {children}
    </div>
  );
}

/**
 * Rótulo de seção.
 *
 * Caixa alta com tracking largo é o único lugar onde o projeto usa versal,
 * reservá-la a metadados mantém o resto do texto legível.
 */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[11px] font-medium tracking-[0.18em] text-denim/60 uppercase">
      {children}
    </h2>
  );
}

/** Ponto de estado. Acompanha texto, nunca aparece sozinho. */
export function StatusDot({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`size-1.5 rounded-full ${className}`} />;
}

/** Etiqueta pequena, para tecnologia e status. */
export function Tag({
  children,
  accent = false,
}: {
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
        accent ? 'bg-lilac/15 text-lilac-soft' : 'bg-denim/10 text-denim'
      }`}
    >
      {children}
    </span>
  );
}

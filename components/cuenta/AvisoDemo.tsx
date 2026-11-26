import { Icono } from '../Icono'
import s from './Cuenta.module.css'

/** Aclara que la cuenta de prueba guarda los cambios en la base embebida del servidor. */
export function AvisoDemo({ texto }: { texto: string }) {
  return <p className={s.demo}><Icono nombre="info" tam={18} />{texto}</p>
}

import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { PayrollDataService } from '../services/payroll-data.service';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule],
  templateUrl: './login.html',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private payrollDataService = inject(PayrollDataService);

  isRegistering = signal(false);
  isForgotPassword = signal(false);
  viewMode = signal<'selection' | 'auth'>('selection');
  
  recoveryStep = signal(1);
  recoveryQuestion = signal('');
  successMessage = signal('');
  errorMessage = signal('');
  showPassword = signal(false);
  showRegisterPassword = signal(false);
  
  allCategories = signal<string[]>([]);
  currentYear = new Date().getFullYear();

  loginForm = this.fb.group({
    matricula: ['', Validators.required],
    contrasena: ['', Validators.required],
  });

  registerForm = this.fb.group({
    matricula: ['', Validators.required],
    contrasena: ['', Validators.required],
    categoria: ['', Validators.required],
    porcentualidad: [100, [Validators.required, Validators.min(1), Validators.max(100)]],
    mesIngreso: [1, [Validators.required]],
    anoAntiguedad: [new Date().getFullYear(), [Validators.required, Validators.min(1900), Validators.max(new Date().getFullYear())]],
    cobraFlexibilidad: [true],
    plusMando: [false],
    plusPersonal: [false],
    securityQuestion: ['', Validators.required],
    securityAnswer: ['', Validators.required],
  });

  recoveryForm = this.fb.group({
    matricula: ['', Validators.required],
    answer: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(4)]],
  });

  constructor() {
    const data2026 = this.payrollDataService.get2026Data();
    const uniqueCats = Array.from(new Set(data2026.map(d => d.category))).filter(Boolean);
    
    this.allCategories.set(uniqueCats);
    
    if (uniqueCats.length > 0) {
      this.registerForm.patchValue({ categoria: uniqueCats[0] });
    }

    // Auto-correct anoAntiguedad if it exceeds current year
    this.registerForm.get('anoAntiguedad')?.valueChanges.subscribe(value => {
      if (value && value > this.currentYear) {
        this.registerForm.patchValue({ anoAntiguedad: this.currentYear }, { emitEvent: false });
      }
    });
  }

  selectMode(mode: 'guest' | 'auth') {
    if (mode === 'guest') {
      this.onGuestLogin();
    } else {
      this.viewMode.set('auth');
      this.isRegistering.set(false);
      this.isForgotPassword.set(false);
    }
  }

  backToSelection() {
    this.viewMode.set('selection');
    this.errorMessage.set('');
    this.successMessage.set('');
    this.loginForm.reset();
    this.registerForm.reset();
  }

  onGuestLogin() {
    this.authService.guestLogin().subscribe(result => {
      if (result.success) {
        this.router.navigate(['/']);
      } else {
        this.errorMessage.set(result.message || 'Error al iniciar como invitado.');
      }
    });
  }

  toggleMode() {
    this.isRegistering.set(!this.isRegistering());
    this.isForgotPassword.set(false);
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  toggleForgotPassword() {
    this.isForgotPassword.set(!this.isForgotPassword());
    this.isRegistering.set(false);
    this.recoveryStep.set(1);
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  onLoginSubmit() {
    if (this.loginForm.valid) {
      const { matricula, contrasena } = this.loginForm.value;
      this.authService.login(matricula!, contrasena!).subscribe(result => {
        if (result.success) {
          if (this.authService.isAdmin()) {
            this.router.navigate(['/admin']);
          } else {
            this.router.navigate(['/']);
          }
        } else {
          this.errorMessage.set(result.message || 'Error al iniciar sesión.');
        }
      });
    }
  }

  onRecoveryStep1() {
    const matricula = this.recoveryForm.get('matricula')?.value;
    if (matricula) {
      this.authService.getSecurityQuestion(matricula).subscribe(question => {
        if (question) {
          this.recoveryQuestion.set(question);
          this.recoveryStep.set(2);
          this.errorMessage.set('');
        } else {
          this.errorMessage.set('Matrícula no encontrada o no tiene pregunta de seguridad.');
        }
      });
    }
  }

  onRecoverySubmit() {
    if (this.recoveryForm.valid) {
      const { matricula, answer, newPassword } = this.recoveryForm.value;
      this.authService.resetPassword(matricula!, answer!, newPassword!).subscribe(result => {
        if (result.success) {
          this.successMessage.set(result.message);
          this.isForgotPassword.set(false);
          this.recoveryStep.set(1);
          this.recoveryForm.reset();
        } else {
          this.errorMessage.set(result.message);
        }
      });
    }
  }

  onRegisterSubmit() {
    if (this.registerForm.valid) {
      const formValue = this.registerForm.value;
      const profile = {
        matricula: formValue.matricula!,
        contrasena: formValue.contrasena!,
        categoria: formValue.categoria!,
        porcentualidad: Number(formValue.porcentualidad),
        mesIngreso: Number(formValue.mesIngreso),
        anoAntiguedad: Number(formValue.anoAntiguedad),
        cobraFlexibilidad: !!formValue.cobraFlexibilidad,
        plusMando: !!formValue.plusMando,
        plusPersonal: !!formValue.plusPersonal,
        securityQuestion: formValue.securityQuestion!,
        securityAnswer: formValue.securityAnswer!,
      };

      this.authService.register(profile).subscribe(result => {
        if (result.success) {
          this.router.navigate(['/']);
        } else {
          this.errorMessage.set(result.message || 'Error al registrar.');
        }
      });
    } else {
      this.errorMessage.set('Por favor, completa todos los campos correctamente.');
    }
  }


}
